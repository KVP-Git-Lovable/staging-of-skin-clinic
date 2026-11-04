-- Merges duplicate `services` rows that differ only by case/whitespace in
-- `name` (e.g. "acne grade 1" vs "Acne Grade 1"), repoints every real
-- foreign key that pointed at a "loser" duplicate onto the surviving
-- "winner" row, backs up each deleted loser into the existing trash system
-- (restorable from the app's Trash UI), then adds a case/whitespace
-- -insensitive unique index so this class of duplicate becomes structurally
-- impossible going forward.
--
-- Safe to re-run: once no group has more than one row, every statement here
-- touches zero rows and the final CREATE UNIQUE INDEX IF NOT EXISTS is a
-- no-op.
--
-- Run the read-only preview query below FIRST and read it before running
-- this migration - it shows exactly which rows will be merged and which one
-- wins. If any group actually contains two *different* legitimate services
-- that happen to share a name, rename one of them before running this.
--
-- Preview (read-only, safe to run anytime):
--
-- WITH ranked AS (
--   SELECT
--     s.id, s.name, s.salesforce_id, s.procedure_notes, s.recommendations, s.created_at,
--     lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) AS norm_name,
--     row_number() OVER (
--       PARTITION BY lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'))
--       ORDER BY
--         (s.procedure_notes IS NOT NULL AND s.procedure_notes <> '') DESC,
--         (coalesce(array_length(s.recommendations, 1), 0) > 0) DESC,
--         (s.salesforce_id IS NOT NULL) DESC,
--         s.created_at ASC
--     ) AS rn
--   FROM public.services s
-- )
-- SELECT norm_name, rn, id, name, salesforce_id,
--        (procedure_notes IS NOT NULL AND procedure_notes <> '') AS has_notes,
--        (coalesce(array_length(recommendations,1), 0) > 0) AS has_recs,
--        created_at
-- FROM ranked
-- WHERE norm_name IN (SELECT norm_name FROM ranked GROUP BY norm_name HAVING count(*) > 1)
-- ORDER BY norm_name, rn;
--
-- Second preview - flags any group where MORE THAN ONE row has its own
-- distinct, real salesforce_id (as opposed to one linked row plus one
-- legacy manually-created row with salesforce_id NULL). This is the case
-- that most needs a human look: it likely means Salesforce itself has two
-- separate records that happen to share a name, and merging will silently
-- drop the loser's specific Salesforce link (a future sync for that
-- Salesforce record will then be reported as a "skipped, conflict" rather
-- than silently duplicated - but it's still worth knowing about upfront):
--
-- SELECT norm_name, count(*) AS distinct_sf_ids, array_agg(salesforce_id) AS salesforce_ids, array_agg(name) AS names
-- FROM public.services
-- WHERE salesforce_id IS NOT NULL
-- GROUP BY lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))
-- HAVING count(*) > 1;

BEGIN;

-- 1. Rank all services within each normalized-name group. Tie-break order:
--    prefer whichever twin already has real procedure_notes, then whichever
--    has real recommendations (so no clinical documentation staff already
--    entered gets discarded - a missing salesforce_id can always be
--    backfilled onto the surviving row by the next "Sync from Salesforce"
--    click via name-matching, but manually-written content that gets
--    deleted is only recoverable from Trash), then prefer a row that
--    already has a salesforce_id, then oldest created_at as a final
--    deterministic tiebreak. (array_length() returns NULL, not 0, for an
--    empty array - default value of `recommendations` - so it's wrapped in
--    coalesce() to avoid that quirk silently reordering the tiebreak.)
CREATE TEMP TABLE _svc_ranked ON COMMIT DROP AS
SELECT
  s.id, s.name,
  lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) AS norm_name,
  row_number() OVER (
    PARTITION BY lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'))
    ORDER BY
      (s.procedure_notes IS NOT NULL AND s.procedure_notes <> '') DESC,
      (coalesce(array_length(s.recommendations, 1), 0) > 0) DESC,
      (s.salesforce_id IS NOT NULL) DESC,
      s.created_at ASC
  ) AS rn
FROM public.services s;

-- 2. Winner/loser map.
CREATE TEMP TABLE _svc_remap ON COMMIT DROP AS
SELECT loser.id AS loser_id, winner.id AS winner_id
FROM _svc_ranked loser
JOIN _svc_ranked winner
  ON winner.norm_name = loser.norm_name AND winner.rn = 1
WHERE loser.rn > 1;

-- 3. Repoint plain foreign keys (no unique constraint that a repoint could violate).
UPDATE public.service_medicines sm
SET service_id = r.winner_id
FROM _svc_remap r WHERE sm.service_id = r.loser_id;

UPDATE public.survey_template_services sts
SET service_id = r.winner_id
FROM _svc_remap r WHERE sts.service_id = r.loser_id;

UPDATE public.survey_templates st
SET service_id = r.winner_id
FROM _svc_remap r WHERE st.service_id = r.loser_id;

UPDATE public.procedure_services ps
SET service_id = r.winner_id
FROM _svc_remap r WHERE ps.service_id = r.loser_id;

-- 4. asset_service_links has UNIQUE(asset_id, service_id): drop the loser's
--    link where the winner already has the same asset_id, then repoint the rest.
DELETE FROM public.asset_service_links l
USING _svc_remap r
WHERE l.service_id = r.loser_id
  AND EXISTS (
    SELECT 1 FROM public.asset_service_links w
    WHERE w.service_id = r.winner_id AND w.asset_id = l.asset_id
  );
UPDATE public.asset_service_links l
SET service_id = r.winner_id
FROM _svc_remap r WHERE l.service_id = r.loser_id;

-- 5. tax_master_services has UNIQUE(tax_id, service_id): same pattern.
DELETE FROM public.tax_master_services l
USING _svc_remap r
WHERE l.service_id = r.loser_id
  AND EXISTS (
    SELECT 1 FROM public.tax_master_services w
    WHERE w.service_id = r.winner_id AND w.tax_id = l.tax_id
  );
UPDATE public.tax_master_services l
SET service_id = r.winner_id
FROM _svc_remap r WHERE l.service_id = r.loser_id;

-- NOTE: appointments.service, procedures.service_name and
-- procedure_services.service_name are plain denormalized text, never
-- FK-linked to services.id, and are intentionally left untouched here -
-- historical records keep whatever exact-case text was captured at the
-- time. Rewriting historical clinical/appointment text is much higher
-- blast-radius than this FK cleanup for a purely cosmetic casing mismatch.

-- 6. Back up loser rows into the existing trash system before deleting, so
--    any row can be restored from the app's Trash UI if a merge picked the
--    wrong winner.
INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name, status)
SELECT 'services', s.id, s.name, to_jsonb(s), 'services-dedupe-migration-20260903', 'trashed'
FROM public.services s
JOIN _svc_remap r ON r.loser_id = s.id;

DELETE FROM public.services s
USING _svc_remap r
WHERE s.id = r.loser_id;

-- 7. Structural guarantee going forward. If any duplicate group was missed
--    above, this fails and the whole transaction rolls back - nothing
--    partially applies.
CREATE UNIQUE INDEX IF NOT EXISTS services_name_normalized_unique_idx
  ON public.services (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));

COMMIT;
