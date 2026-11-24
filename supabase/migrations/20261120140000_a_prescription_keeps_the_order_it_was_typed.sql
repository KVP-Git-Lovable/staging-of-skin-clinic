-- A prescription keeps the order it was typed in.
--
-- Dr Vindhya typed Triclenz, then Triflow Shampoo. The preview showed Deriva
-- CMS first, then Triflow, then Triclenz. Not alphabetical, not what she
-- typed - no order at all.
--
-- A save writes every product in one statement, and now() is fixed for the
-- whole statement, so all of them land on the same created_at. The nine rows
-- on procedure 31364318-042e-4b5c-86e7-e1c5c8c2f5c5 all read
-- 2026-11-20 11:51:49.025033. id is a random uuid and carries no order
-- either. So nothing in this table has ever recorded the order the doctor
-- typed, and the three places that read it could only guess:
--
--   generate-prescription-pdf   order by created_at  - every row ties
--   ProcedureDetailSheet        no order at all
--   AppointmentDetailSheet      no order at all
--
-- With a tie and no tiebreak, Postgres returns whatever suits it, and that
-- changes after an edit moves a row.
--
-- The sibling list already had the answer: procedure_services carries
-- sort_order, written as `sort_order: i` and read back with
-- .order("sort_order"). Prescriptions were never given the same thing. This
-- adds it, and the app writes and reads it the same way.
--
-- Nullable, no default, no NOT NULL: the currently published build neither
-- writes nor reads this column, so it keeps working untouched until the next
-- publish.
--
-- Prescriptions saved BEFORE this cannot be put back into the order they
-- were typed - that order was never written down and nothing holds it. They
-- keep sort_order null, sort after the numbered ones, and are then ordered
-- by created_at and id, which at least makes them stable instead of
-- reshuffling between one viewing and the next. No backfill is attempted,
-- because any value invented here would be a guess presented as the
-- doctor's intent.

alter table public.prescriptions add column if not exists sort_order integer;

comment on column public.prescriptions.sort_order is
  'Position in the list as the clinician typed it, 0-based. Null on rows written before this column existed; readers order by sort_order nulls last, then created_at, then id.';

-- Reading a procedure's prescriptions is the hot path for the PDF builder
-- and both lists, and it is now always ordered by this.
create index if not exists prescriptions_procedure_sort_idx
  on public.prescriptions (procedure_id, sort_order, created_at, id);
