-- Recover the doctor on appointments where the name only survives in the text,
-- then finish stripping the "(Dr. …)" suffix.
--
-- 20260917000000 deliberately left ~3,655 rows alone: their staff_id is null, so
-- the "(Dr. <name>)" the old importer appended is the ONLY record of who saw the
-- patient, and removing it would destroy part of a clinical record.
--
-- staff_id is null on those rows because buildDoctorMap() in sf-import-clinical
-- could not tie the Salesforce name to a staff row AT THE TIME THEY WERE
-- IMPORTED - many are from 2020-2021. The staff table has grown since, so
-- re-running the match against TODAY'S staff recovers the ones that are now
-- present. Anything still unmatched afterwards is a doctor genuinely missing
-- from the staff table; those rows keep their suffix and are listed by the query
-- at the end of this file.
--
-- WHY THIS IS CONSERVATIVE. Attributing a visit to the wrong doctor is worse
-- than leaving it unattributed, so unlike the importer - which takes the first
-- staff row that matches - this only writes a staff_id when EXACTLY ONE staff
-- member matches. An ambiguous name is left null and keeps its suffix.
--
-- Re-runnable: both statements no-op once there is nothing left to do, so this
-- is also the thing to run again after a missing doctor is added to staff.

-- normalize() from sf-import-clinical/index.ts:56, as SQL: lowercase, anything
-- that is not a letter/digit becomes a space, runs of space collapse.
CREATE OR REPLACE FUNCTION public.normalize_name(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(_text, '')), '[^a-z0-9 ]', ' ', 'g'),
                              '\s+', ' ', 'g'));
$$;

COMMENT ON FUNCTION public.normalize_name(text) IS
  'Lowercased, punctuation-stripped name key. Mirrors normalize() in sf-import-clinical/index.ts.';

-- 1. Put the doctor in its own column wherever today's staff list can identify
--    them. Mirrors buildDoctorMap()'s primary rule: every meaningful token of
--    the staff member's name ("dr" and tokens of 2 characters or fewer ignored,
--    so titles and initials never decide a match) must appear in the name taken
--    from the appointment text.
WITH staff_tokens AS (
  SELECT s.id,
         ARRAY(
           SELECT t
             FROM unnest(string_to_array(
                    public.normalize_name(s.first_name || ' ' || s.last_name), ' ')) AS t
            WHERE length(t) > 2 AND t <> 'dr'
         ) AS tokens
    FROM public.staff s
), candidate AS (
  SELECT a.id AS appointment_id, st.id AS staff_id
    FROM public.appointments a
    CROSS JOIN LATERAL (
      SELECT public.normalize_name(
               substring(a.reason_for_consultation from '\(Dr\.\s([^()]*)\)\s*$')) AS k
    ) n
    JOIN staff_tokens st
      ON cardinality(st.tokens) > 0
     AND NOT EXISTS (
           SELECT 1 FROM unnest(st.tokens) AS t WHERE position(t IN n.k) = 0
         )
   WHERE a.source = 'salesforce'
     AND a.staff_id IS NULL
     AND a.reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$'
     AND n.k <> ''
), unique_match AS (
  -- One staff member, and only one. A name that matches two people is left
  -- alone rather than guessed at.
  SELECT appointment_id, (array_agg(staff_id))[1] AS staff_id
    FROM candidate
   GROUP BY appointment_id
  HAVING count(DISTINCT staff_id) = 1
)
UPDATE public.appointments a
   SET staff_id = u.staff_id
  FROM unique_match u
 WHERE a.id = u.appointment_id;

-- 2. Now that the doctor is recorded properly, the suffix is redundant on those
--    rows. Identical to 20260917000000 - rerunning it here also picks up any
--    appointment imported since by an edge function that has not been
--    redeployed yet.
UPDATE public.appointments
   SET reason_for_consultation =
         nullif(btrim(regexp_replace(reason_for_consultation, '\s*\(Dr\.\s[^()]*\)\s*$', '')), '')
 WHERE source = 'salesforce'
   AND staff_id IS NOT NULL
   AND reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$';

-- What is left, if anything, is a doctor who is not in the staff table at all:
--
--   SELECT btrim(substring(reason_for_consultation from '\(Dr\.\s([^()]*)\)\s*$')) AS doctor_in_text,
--          count(*) AS appointments,
--          min((start_time AT TIME ZONE 'Asia/Kolkata')::date) AS first_seen,
--          max((start_time AT TIME ZONE 'Asia/Kolkata')::date) AS last_seen
--     FROM public.appointments
--    WHERE source = 'salesforce'
--      AND staff_id IS NULL
--      AND reason_for_consultation ~ '\(Dr\.\s[^()]*\)\s*$'
--    GROUP BY 1 ORDER BY 2 DESC;
--
-- Add those people to staff and run this migration again.
