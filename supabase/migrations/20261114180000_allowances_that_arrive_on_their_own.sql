-- Allowances that arrive on their own, and a limit on asking.
--
-- Three gaps, all found by the clinic asking where to configure them.
--
--   1. leave_types.default_days_per_year has been there since March and
--      NOTHING has ever acted on it. No trigger, no function, no screen.
--      Casual Leave says 12 days a year and 0 of the 18 active staff have a
--      balance, so the first approved leave would have created a row with no
--      allowance and sent the remainder negative.
--
--   2. Leave is all-or-nothing on 1 January. The clinic wants a day a month
--      for some types instead.
--
--   3. There is no limit on how many corrections somebody may ask for. That
--      was their own earlier choice and they have changed their mind.
--
-- Backward-compatible with the published build: two columns and a trigger,
-- both columns NOT NULL with a default that preserves today's behaviour
-- exactly - 'yearly' is what every type does now, and a limit of 0 means
-- unlimited, which is what there is now. Nothing is renamed or dropped.

-- ── 1. How a leave type hands its days out ──
--
-- One number per type, not two. The monthly rate is the yearly figure over
-- twelve, so Casual Leave's 12 becomes exactly the "one day a month" the
-- clinic described, and there is no second field to keep in step with the
-- first.

alter table public.leave_types
  add column if not exists accrual text not null default 'yearly';

alter table public.leave_types
  drop constraint if exists leave_types_accrual_check;
alter table public.leave_types
  add constraint leave_types_accrual_check check (accrual in ('yearly', 'monthly'));

comment on column public.leave_types.accrual is
  'yearly = the whole default_days_per_year is available from 1 January. monthly = a twelfth of it accrues each month, so by March a person has three twelfths.';

-- ── 2. How many corrections somebody may ask for in a month ──
--
-- On attendance_config beside the other check-in settings, which is where
-- AttendanceSettings.tsx said regularisation's settings would arrive when
-- the feature did.
--
-- 0 means no limit, and is the default, so applying this changes nothing
-- until somebody sets a number.

alter table public.attendance_config
  add column if not exists regularisation_monthly_limit integer not null default 0;

alter table public.attendance_config
  drop constraint if exists attendance_config_regularisation_limit_check;
alter table public.attendance_config
  add constraint attendance_config_regularisation_limit_check
  check (regularisation_monthly_limit >= 0 and regularisation_monthly_limit <= 31);

comment on column public.attendance_config.regularisation_monthly_limit is
  'How many corrections one person may ask for against any one month. 0 = no limit. Counted on the month being CORRECTED, not the month of asking, and a rejected request does not count against it.';

-- ── 3. The limit, enforced where it cannot be talked round ──
--
-- The form will say how many are left; this is what makes it true. Counted
-- on the month being corrected rather than the month of asking, because
-- "three corrections for November" is what the rule means to anybody
-- reading it - somebody tidying up on 1 December is still fixing November.
--
-- A rejected request does not count. It was not a correction; it was a
-- question that got the answer no, and spending somebody's quota on it
-- would make rejecting twice as punishing as approving.

create or replace function public.enforce_regularisation_limit()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_limit integer;
  v_used integer;
begin
  select regularisation_monthly_limit into v_limit
    from public.attendance_config
   order by updated_at desc
   limit 1;

  if coalesce(v_limit, 0) <= 0 then
    return new;
  end if;

  select count(*) into v_used
    from public.attendance_regularisations r
   where r.staff_id = new.staff_id
     and r.status <> 'Rejected'
     and date_trunc('month', r.date) = date_trunc('month', new.date);

  if v_used >= v_limit then
    raise exception
      'You have already used all % correction(s) allowed for %',
      v_limit, to_char(new.date, 'FMMonth YYYY')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

comment on function public.enforce_regularisation_limit() is
  'Refuses a regularisation once the person has used the month''s allowance. Rejected requests do not count; 0 means unlimited.';

drop trigger if exists enforce_regularisation_limit on public.attendance_regularisations;
create trigger enforce_regularisation_limit
  before insert on public.attendance_regularisations
  for each row execute function public.enforce_regularisation_limit();
