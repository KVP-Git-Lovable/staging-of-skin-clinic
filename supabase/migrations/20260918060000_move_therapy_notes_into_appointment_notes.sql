-- Move therapy notes into the appointment Notes tab, then retire the table.
--
-- therapy_notes (20260511044148) was never wired up: no form writes it, no view
-- reads it, and no Salesforce importer fills it. Meanwhile the notes staff
-- actually write during a visit go to appointment_sticky_notes (20260917030000),
-- which is what the Notes tab on an appointment shows. Two tables for one idea,
-- one of them unreachable.
--
-- This carries anything in the dead table over to the live one and retires it,
-- so there is a single place a visit note can be.
--
-- NO DATA LOSS IS THE POINT, so the retirement is not taken on trust:
--   * every column is carried, including created_at/updated_at and authorship;
--   * created_by_name has no column on the target, so it is folded into the
--     note title rather than discarded;
--   * the row count moved is compared against the source, and a mismatch raises,
--     which rolls the whole migration back and leaves therapy_notes untouched.
--
-- The copy is safe against the target's triggers: stamp_audit_user COALESCEs
-- created_by/updated_by on INSERT rather than overriding them (20260830052705),
-- and appointment_sticky_notes_updated_at is BEFORE UPDATE only - so the
-- original timestamps and author survive the insert.
--
-- At the time of writing therapy_notes holds 0 rows, so in this database the
-- copy is a no-op. The copy is written for correctness anyway: it must also be
-- right for any database where it is not 0.

DO $$
DECLARE
  source_rows bigint;
  moved_rows  bigint;
BEGIN
  IF to_regclass('public.therapy_notes') IS NULL THEN
    RAISE NOTICE 'therapy_notes does not exist - nothing to move.';
    RETURN;
  END IF;

  IF to_regclass('public.appointment_sticky_notes') IS NULL THEN
    RAISE EXCEPTION 'appointment_sticky_notes is missing; run 20260917030000 first.';
  END IF;

  SELECT count(*) INTO source_rows FROM public.therapy_notes;

  INSERT INTO public.appointment_sticky_notes
    (appointment_id, title, content, created_by, updated_by, created_at, updated_at)
  SELECT
    t.appointment_id,
    -- Marks where the note came from, and keeps created_by_name, which the
    -- target has no column for. A note whose author was never recorded just
    -- reads "Therapy note".
    CASE
      WHEN COALESCE(btrim(t.created_by_name), '') <> ''
        THEN 'Therapy note - ' || btrim(t.created_by_name)
      ELSE 'Therapy note'
    END,
    t.note,
    t.created_by,
    t.created_by,
    t.created_at,
    t.updated_at
  FROM public.therapy_notes t;

  GET DIAGNOSTICS moved_rows = ROW_COUNT;

  -- The guard everything else hangs on. Anything short of a complete copy
  -- aborts the transaction, so therapy_notes and its rows are still there
  -- afterwards.
  IF moved_rows <> source_rows THEN
    RAISE EXCEPTION 'Refusing to retire therapy_notes: % of % row(s) moved.',
      moved_rows, source_rows;
  END IF;

  RAISE NOTICE 'Moved % therapy note(s) into appointment_sticky_notes.', moved_rows;

  -- Retired by renaming, not dropping: a rename is reversible by hand, and an
  -- empty parked table costs nothing. Its policies, index and trigger travel
  -- with it under the new name.
  --
  -- This is deliberately inside the same block as the copy. Split across two DO
  -- blocks, a copy that failed still left the rename to run on its own and
  -- retire a table whose rows had not moved - the rows survived under the new
  -- name, but the table was retired on a copy that never happened. Here a
  -- failure at any point above means the rename never runs at all.
  --
  -- Nothing references it any more: the app's only mention was the patient-merge
  -- dialog, and that stops naming it in this same change.
  ALTER TABLE public.therapy_notes RENAME TO therapy_notes_retired_20260918;
  COMMENT ON TABLE public.therapy_notes_retired_20260918 IS
    'Retired 2026-09-18. Never wired up to any UI; its rows were moved into appointment_sticky_notes, which the Notes tab on an appointment reads. Safe to drop once the move has been confirmed in production.';
END $$;
