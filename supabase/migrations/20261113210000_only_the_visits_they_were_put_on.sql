-- Only the visits they were put on.
--
-- A therapist impersonated into the Appointments page saw "All Appointments
-- - 58,001 items": every patient the clinic has ever seen, with phone
-- numbers, and a New Appt button, a status dropdown and a delete icon on
-- each. The screens are one half of why; this is the other. appointments has
-- carried `FOR SELECT USING (true)` for every signed-in staff member since
-- 20260818103000, so hiding it in the client would have been a curtain.
--
-- ── Why this cannot use data_scope ──
--
-- The obvious move is the existing user_roles_config.data_scope, which
-- already means "own rows only". It cannot be used here: Doctor is ALREADY
-- data_scope = 'own', for billing, and 20260923000000 deliberately took
-- appointment scoping away again because "doctors cover for each other on
-- emergency leave". Hanging this off data_scope would silently re-impose on
-- doctors the exact thing that migration removed.
--
-- So appointment_scope is its own axis, defaulting to 'all', and only
-- Therapist and Nurse are set to 'assigned'.
--
-- Backward-compatible with the published build: one added column with a
-- default, nothing renamed or dropped, and the policies below read as `true`
-- for every role that is not 'assigned' - which today is every role anybody
-- can actually sign in as. The only accounts whose view changes are
-- therapists and nurses, which is the change being asked for.

-- ── 1. The axis ──

alter table public.user_roles_config
  add column if not exists appointment_scope text not null default 'all';

alter table public.user_roles_config
  drop constraint if exists user_roles_config_appointment_scope_check;
alter table public.user_roles_config
  add constraint user_roles_config_appointment_scope_check
  check (appointment_scope in ('all', 'assigned'));

comment on column public.user_roles_config.appointment_scope is
  'all = every appointment; assigned = only those where this person is the doctor or one of the therapists. Deliberately separate from data_scope, which doctors already carry as ''own'' for billing.';

update public.user_roles_config
   set appointment_scope = 'assigned'
 where lower(name) in ('therapist', 'nurse')
   and appointment_scope is distinct from 'assigned';

-- ── 2. The predicate ──
--
-- Defaults to TRUE wherever anything is missing - no staff row, no role, no
-- column - exactly as has_full_data_scope does. A misconfiguration must
-- never be able to blank the appointment list for the whole clinic.

create or replace function public.sees_all_appointments()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $fn$
  select coalesce(
    (select urc.appointment_scope is distinct from 'assigned'
       from public.staff s
       left join public.user_roles_config urc on urc.id = s.role_id
      where s.auth_user_id = auth.uid()
      limit 1),
    true);
$fn$;

comment on function public.sees_all_appointments() is
  'False only for a role whose appointment_scope is ''assigned''. Defaults true so nothing missing can hide the clinic''s own appointments from it.';

revoke all on function public.sees_all_appointments() from public, anon;

-- ── 3. The policies ──
--
-- Restrictive, so they AND with the permissive ones already there rather
-- than widening anything.
--
-- Every helper call is wrapped in (select ...) on the lesson recorded in
-- 20260910160000: hoisted, Postgres runs it once per query instead of once
-- per row - 7ms against 874ms over 50k rows there, and this table holds
-- 57,970.
--
-- Three ways an appointment can be yours, matching what the screens show:
-- you are the doctor on it, you are its therapist, or you are one of its
-- therapists. The last two are both needed - therapist_id is what the
-- published build writes, therapist_ids is what this one does.

drop policy if exists "scope appointments to the assigned" on public.appointments;
create policy "scope appointments to the assigned"
  on public.appointments as restrictive for select to authenticated
  using (
    (select public.sees_all_appointments())
    or staff_id = (select public.current_staff_id())
    or therapist_id = (select public.current_staff_id())
    or (select public.current_staff_id()) = any (therapist_ids)
  );

-- The same reach for changing one. This does not make a therapist read-only
-- - that is the can_edit row the screens now honour - but it does mean the
-- furthest an API call could get is their own assigned visits, instead of
-- all 58,001.
drop policy if exists "scope appointment writes to the assigned" on public.appointments;
create policy "scope appointment writes to the assigned"
  on public.appointments as restrictive for update to authenticated
  using (
    (select public.sees_all_appointments())
    or staff_id = (select public.current_staff_id())
    or therapist_id = (select public.current_staff_id())
    or (select public.current_staff_id()) = any (therapist_ids)
  );

drop policy if exists "scope appointment deletes to the assigned" on public.appointments;
create policy "scope appointment deletes to the assigned"
  on public.appointments as restrictive for delete to authenticated
  using (
    (select public.sees_all_appointments())
    or staff_id = (select public.current_staff_id())
    or therapist_id = (select public.current_staff_id())
    or (select public.current_staff_id()) = any (therapist_ids)
  );

-- Notes follow their appointment. appointment_sticky_notes is readable and
-- writable by every signed-in account (20260923000000 dropped its scoping
-- along with the appointments one), so without this a therapist who cannot
-- see a visit could still read what was written on it.
drop policy if exists "scope appointment notes to the assigned" on public.appointment_sticky_notes;
create policy "scope appointment notes to the assigned"
  on public.appointment_sticky_notes as restrictive for select to authenticated
  using (
    (select public.sees_all_appointments())
    or appointment_id in (
      select a.id from public.appointments a
       where a.staff_id = (select public.current_staff_id())
          or a.therapist_id = (select public.current_staff_id())
          or (select public.current_staff_id()) = any (a.therapist_ids)
    )
  );

-- ── 4. Appointments become read-only for them ──
--
-- The clinic asked for New Appt "and all" to go. Create and delete were
-- already false; edit was left on in 20261113060000 so the detail sheet
-- could save, which it turns out they do not need - notes live in
-- appointment_sticky_notes and ask nothing of this row.

update public.role_module_permissions p
   set can_edit = false, can_create = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and p.module_key = 'appointments'
   and lower(r.name) in ('therapist', 'nurse');
