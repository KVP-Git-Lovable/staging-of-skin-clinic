-- A copy of every visit's notes, before anything can overwrite them
--
-- `ProcedureDetailSheet` saves a visit with
--
--     procedure_notes: kept.length ? combine("procedure_notes") : editProcedureNotes
--
-- where `kept` is the visit's surviving service lines. So any save on a visit
-- that HAS service lines replaces `procedures.procedure_notes` with the
-- concatenated service descriptions.
--
-- That was mostly harmless while imported visits had no service lines:
-- `kept.length` was 0 and the text was kept. Moving the treatments out of
-- `prescriptions` (20260924200000) gave 4,565 visits their first service lines,
-- and 2,490 of those hold their only prescription record in that free text -
-- the take-home products the doctor typed, which the screen and the printed
-- prescription both read when a visit has no structured medicine rows.
--
-- There is no recovery path: `history_tracking_config` is empty, so
-- `log_field_history` returns before logging and `procedures` keeps no field
-- history at all.
--
-- This does not fix the save path - that is application code and is still
-- outstanding. It makes the loss recoverable in the meantime, which is the part
-- that cannot wait. Restoring one visit is:
--
--     update procedures p set procedure_notes = b.procedure_notes
--     from procedure_notes_backup_20260924 b
--     where b.id = p.id and p.id = '<visit id>';
--
-- Verified at the time of writing: 25,352 rows, byte-identical to live.

create table if not exists public.procedure_notes_backup_20260924 as
select id, procedure_notes, now() as taken_at
from public.procedures
where coalesce(btrim(procedure_notes), '') <> '';

-- Patient clinical text. RLS on with no policy at all, so nothing reaches it
-- through PostgREST; the service role still can.
alter table public.procedure_notes_backup_20260924 enable row level security;
revoke all on public.procedure_notes_backup_20260924 from anon, authenticated;
