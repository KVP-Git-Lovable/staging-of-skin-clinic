-- A punch somebody forgot, and the person who can put it right.
--
-- Two things the clinic asked for and the app has never had.
--
-- REGULARISATION. Somebody forgets to press End My Day; the record sits open
-- for ever and the month's hours are wrong. There was no way to ask for that
-- to be corrected and no way for an admin to do it from a screen - the only
-- correction in this repo's history was made by hand in SQL. The attendance
-- update policy has allowed an admin to correct a row since 20261102140000;
-- what was missing was the request, the decision and the audit of both.
--
-- APPROVALS GOING SOMEWHERE. Leave applications have existed since March and
-- nothing has ever told anybody one had arrived - an admin had to think to
-- open the page. The clinic named two people who should be told: Dr Vindhya
-- Pai and Suyog.
--
-- Backward-compatible with the published build: one new table, one new
-- column with a default, and triggers. Nothing renamed, nothing dropped, no
-- new NOT NULL without a default. The published build knows none of it, and
-- its leave page goes on working exactly as it does - it will simply cause
-- a notification it cannot see.

-- ── 1. Who decides ──
--
-- A column rather than "every admin", because the clinic named two people
-- out of three admins, and rather than two ids in a function body, because
-- then changing who approves means a migration. One tick in the database
-- today, and a checkbox whenever that is worth building.

alter table public.staff
  add column if not exists approves_requests boolean not null default false;

comment on column public.staff.approves_requests is
  'Gets the bell notification when somebody applies for leave or a regularisation. Deciding is still an admin right; this only says who is told.';

update public.staff
   set approves_requests = true
 where lower(coalesce(email, '')) in ('drvindhyapai@gmail.com', 'suyog.h@kvpcorp.com')
   and approves_requests is distinct from true;

-- ── 2. The request ──

create table if not exists public.attendance_regularisations (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  -- The day being corrected. Not unique: a second request for the same day
  -- is reasonable when the first was rejected.
  date date not null,
  -- Either or both. Somebody who forgot only to clock out sends one time.
  requested_check_in timestamptz,
  requested_check_out timestamptz,
  reason text not null,
  status text not null default 'Pending',
  decided_by uuid references public.staff(id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_regularisations_status_check
    check (status in ('Pending', 'Approved', 'Rejected')),
  -- A request that asks for nothing cannot be acted on, and the screen would
  -- have no way to say what it was for.
  constraint attendance_regularisations_wants_something
    check (requested_check_in is not null or requested_check_out is not null),
  constraint attendance_regularisations_in_before_out
    check (requested_check_in is null
           or requested_check_out is null
           or requested_check_out > requested_check_in)
);

create index if not exists attendance_regularisations_staff_date_idx
  on public.attendance_regularisations (staff_id, date desc);
create index if not exists attendance_regularisations_pending_idx
  on public.attendance_regularisations (status, created_at desc);

drop trigger if exists attendance_regularisations_updated_at on public.attendance_regularisations;
create trigger attendance_regularisations_updated_at
  before update on public.attendance_regularisations
  for each row execute function public.update_updated_at_column();

-- ── 3. Who may see and do what ──
--
-- The same shape attendance_records and the leave tables carry: your own
-- rows, unless you are an admin. AGENTS.md requires the restrictive staff
-- guard on every RLS-enabled public table, so it goes on here too.

alter table public.attendance_regularisations enable row level security;
revoke all on public.attendance_regularisations from anon;
grant select, insert, update, delete on public.attendance_regularisations to authenticated;
grant all on public.attendance_regularisations to service_role;

drop policy if exists signed_in_must_be_staff on public.attendance_regularisations;
create policy signed_in_must_be_staff
  on public.attendance_regularisations as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

drop policy if exists "Staff read own regularisations, admins read all" on public.attendance_regularisations;
create policy "Staff read own regularisations, admins read all"
  on public.attendance_regularisations for select to authenticated
  using ((select public.is_admin_user()) or staff_id = (select public.current_staff_id()));

drop policy if exists "Staff ask only for their own days" on public.attendance_regularisations;
create policy "Staff ask only for their own days"
  on public.attendance_regularisations for insert to authenticated
  with check (staff_id = (select public.current_staff_id()));

drop policy if exists "Only admins decide a regularisation" on public.attendance_regularisations;
create policy "Only admins decide a regularisation"
  on public.attendance_regularisations for update to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

drop policy if exists "Only admins delete a regularisation" on public.attendance_regularisations;
create policy "Only admins delete a regularisation"
  on public.attendance_regularisations for delete to authenticated
  using ((select public.is_admin_user()));

-- ── 4. Telling the people who decide ──
--
-- Shaped after open_feedback_rca (20261106090000), which already fans a
-- notification out to a set of staff from a trigger. Definer, because the
-- applicant is the one inserting and the notifications insert policy pins
-- created_by to the caller - the row is addressed to somebody else.

create or replace function public.notify_request_approvers()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_who text;
  v_title text;
  v_body text;
  v_link text;
begin
  select btrim(s.first_name || ' ' || coalesce(s.last_name, ''))
    into v_who
    from public.staff s where s.id = new.staff_id;
  v_who := coalesce(nullif(v_who, ''), 'A staff member');

  if tg_table_name = 'leave_applications' then
    v_title := 'Leave request from ' || v_who;
    v_body := v_who || ' has asked for ' || new.days || ' day(s) from '
              || to_char(new.start_date, 'DD Mon') || ' to ' || to_char(new.end_date, 'DD Mon')
              || coalesce(' - ' || nullif(btrim(new.reason), ''), '');
    v_link := '/leave?tab=applications';
  else
    v_title := 'Attendance correction from ' || v_who;
    v_body := v_who || ' has asked to correct ' || to_char(new.date, 'DD Mon')
              || ' - ' || btrim(new.reason);
    v_link := '/leave?tab=regularisations';
  end if;

  insert into public.notifications (user_id, title, body, object_type, record_id, link, created_by)
  select s.auth_user_id, v_title, v_body, tg_table_name, new.id, v_link, auth.uid()
    from public.staff s
   where s.approves_requests
     and s.is_active is not false
     and s.auth_user_id is not null
     -- Telling somebody about their own request is noise, not news.
     and s.id is distinct from new.staff_id;

  return new;
end;
$fn$;

comment on function public.notify_request_approvers() is
  'Bell notification to every staff.approves_requests when a leave application or an attendance regularisation is filed.';

drop trigger if exists notify_approvers on public.leave_applications;
create trigger notify_approvers
  after insert on public.leave_applications
  for each row execute function public.notify_request_approvers();

drop trigger if exists notify_approvers on public.attendance_regularisations;
create trigger notify_approvers
  after insert on public.attendance_regularisations
  for each row execute function public.notify_request_approvers();

-- ── 5. Telling the person who asked ──
--
-- A request that is approved in silence is a request somebody keeps asking
-- about.

create or replace function public.notify_requester_of_decision()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_user uuid;
  v_what text;
  v_link text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('Approved', 'Rejected') then
    return new;
  end if;

  select s.auth_user_id into v_user from public.staff s where s.id = new.staff_id;
  if v_user is null then
    return new;
  end if;

  if tg_table_name = 'leave_applications' then
    v_what := 'Your leave request was ' || lower(new.status);
    v_link := '/leave?tab=mine';
  else
    v_what := 'Your attendance correction for ' || to_char(new.date, 'DD Mon')
              || ' was ' || lower(new.status);
    v_link := '/leave?tab=my-regularisations';
  end if;

  insert into public.notifications (user_id, title, body, object_type, record_id, link, created_by)
  values (v_user, v_what, null, tg_table_name, new.id, v_link, auth.uid());

  return new;
end;
$fn$;

drop trigger if exists notify_requester on public.leave_applications;
create trigger notify_requester
  after update on public.leave_applications
  for each row execute function public.notify_requester_of_decision();

drop trigger if exists notify_requester on public.attendance_regularisations;
create trigger notify_requester
  after update on public.attendance_regularisations
  for each row execute function public.notify_requester_of_decision();

-- ── 6. An approval that actually corrects the day ──
--
-- In a trigger rather than the screen. The leave page's own approval is two
-- client writes that are not a transaction, and its balance half has
-- silently done nothing since it was written; a correction that says
-- "approved" and leaves the attendance untouched would be the same bug with
-- somebody's pay behind it.
--
-- Definer so the decision writes the applicant's row. An admin may already
-- update any attendance record directly, so this grants no reach an admin
-- did not have - it only makes it atomic with the decision.

create or replace function public.apply_approved_regularisation()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.status is not distinct from old.status or new.status <> 'Approved' then
    return new;
  end if;

  insert into public.attendance_records (staff_id, date, check_in_time, check_out_time, status)
  values (new.staff_id, new.date, new.requested_check_in, new.requested_check_out, 'present')
  on conflict (staff_id, date) do update
     -- Only what was asked for. A request to fix a missed check-out must not
     -- blank the check-in that was recorded properly.
     set check_in_time  = coalesce(excluded.check_in_time, attendance_records.check_in_time),
         check_out_time = coalesce(excluded.check_out_time, attendance_records.check_out_time);

  return new;
end;
$fn$;

comment on function public.apply_approved_regularisation() is
  'On approval, writes the requested times onto the attendance record for that staff member and day. COALESCEs, so a one-sided correction leaves the other end alone.';

drop trigger if exists apply_approved_regularisation on public.attendance_regularisations;
create trigger apply_approved_regularisation
  after update on public.attendance_regularisations
  for each row execute function public.apply_approved_regularisation();
