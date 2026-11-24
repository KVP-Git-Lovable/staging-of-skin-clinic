-- A third way a leave type hands its days out: not on its own.
--
-- Found by reading the clinic's own four types against the button that was
-- about to grant them:
--
--   Maternity Leave   180 days/year   active   →   18 people
--
-- 180 days is a statutory entitlement for the person who needs it, not an
-- annual allowance for all eighteen staff. Granting it to everybody puts a
-- 180-day balance on every record, and the leave approval screen deducts
-- from whatever balance it finds - so it would then approve six months off
-- for anyone who asked, against a number nobody chose.
--
-- 'manual' says: this type is granted by hand, when somebody needs it, and
-- the Update allowances button leaves it alone. That is what the clinic has
-- always done with it - by having no balances at all.
--
-- Backward-compatible with the published build: widening a CHECK can only
-- accept more than it did, and the published build never reads or writes
-- this column (it was added an hour ago). Nothing is renamed or dropped.

alter table public.leave_types
  drop constraint if exists leave_types_accrual_check;
alter table public.leave_types
  add constraint leave_types_accrual_check
  check (accrual in ('yearly', 'monthly', 'manual'));

comment on column public.leave_types.accrual is
  'yearly = the whole default_days_per_year is available from 1 January. monthly = a twelfth of it accrues each month. manual = granted by hand only; the bulk allowance update skips it.';

-- Maternity Leave, specifically, and only while it still looks like the row
-- this was written for. An admin can change it back on the Leave Types tab
-- in two clicks; this is the safe starting point, not a decision taken away
-- from them.
update public.leave_types
   set accrual = 'manual'
 where name = 'Maternity Leave'
   and accrual = 'yearly'
   and default_days_per_year >= 90;
