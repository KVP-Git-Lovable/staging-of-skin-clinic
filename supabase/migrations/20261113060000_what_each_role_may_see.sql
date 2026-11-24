-- What each role may see, before anybody new can sign in.
--
-- Therapists and nurses are about to get their own logins so they can mark
-- attendance from a phone. Three things had to be true first, and none of them
-- was.
--
--   1. The left-hand menu hid nothing. AppSidebar's canView() was `return
--      true` with a note saying "for now", so every signed-in person was
--      offered all 47 pages and the route guard then refused most of them.
--      That half is code; this migration is the rows behind it.
--
--   2. The leave tables were open to everyone. leave_applications, leave_types
--      and staff_leave_balances still carried blanket USING (true) policies
--      from 20260818103000: any signed-in staff member could read every
--      colleague's leave and reasons, approve or reject any application
--      including their own, grant themselves a balance, and delete leave
--      types. Attendance was hardened in November; leave never was. Creating
--      ten new logins before fixing it would have handed each of them the
--      whole clinic's leave data and the approve button.
--
--   3. There was no attendance module key at all, /attendance had no route
--      guard, and the clinic-wide view at /admin/attendance was guarded by
--      "staff" - which Receptionist holds in full.
--
-- Backward-compatible with the currently published build as AGENTS.md
-- requires: no table, column or constraint changes at all. Only permission
-- rows and policies. The policies are written so the admin flows the published
-- build actually offers keep working - see the insert policy below.
--
-- Who this can affect today: exactly six accounts have ever signed in - three
-- admins and three doctors. No receptionist, nurse or therapist has ever used
-- the app, and the one Therapist login signed in once, twenty seconds after it
-- was created, as a test. So the Therapist and Nurse rows below are set to
-- what the clinic asked for rather than preserved.

-- ── 1. is_admin_user(), which exists only in the live database ──
--
-- Every attendance policy calls it and no migration defines it, so a fresh
-- `supabase db reset` would fail on this repo. Written out verbatim as it
-- stands in the database, so applying this changes nothing and ends the drift.

create or replace function public.is_admin_user()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
      JOIN public.user_roles_config urc ON urc.id = s.role_id
     WHERE s.auth_user_id = auth.uid()
       AND s.is_active IS NOT FALSE
       AND lower(urc.name) = 'admin'
  );
$fn$;

-- ── 2. The new module keys ──
--
-- role_module_permissions is UNIQUE (role_id, module_key), so every statement
-- below is an upsert and the whole migration is re-runnable.
--
-- A key with no row reads as denied, and User Management's Save deletes every
-- row for a role and reinserts only the keys in src/lib/modules.ts - so a new
-- key needs both the registry entry and this back-fill, or it is denied until
-- somebody ticks it by hand.

-- Everybody records their own attendance. View and create; a day already
-- recorded is closed by an update the attendance policies allow on your own
-- row, not by this permission.
insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'attendance', true, true, lower(r.name) = 'admin', lower(r.name) = 'admin'
  from public.user_roles_config r
 where lower(r.name) in ('admin','doctor','receptionist','pharmacist','nurse','therapist')
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- Everyone else's attendance - punch times, selfies and locations - is for
-- admins. It was reachable by anyone holding "staff".
insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'attendance_admin', lower(r.name) = 'admin', lower(r.name) = 'admin',
       lower(r.name) = 'admin', lower(r.name) = 'admin'
  from public.user_roles_config r
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- Trash had no key and no route guard, so it sat on every menu and opened for
-- anyone. Granted to every role that can reach it today, which keeps the three
-- doctors who use the app where they were, and withheld from the two roles
-- that are new to it.
insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'trash',
       lower(r.name) not in ('nurse','therapist'),
       false,
       lower(r.name) = 'admin',
       lower(r.name) = 'admin'
  from public.user_roles_config r
 where lower(r.name) in ('admin','doctor','receptionist','pharmacist','nurse','therapist')
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- ── 3. Therapist and Nurse ──
--
-- The clinic asked for these two to be one profile: the dashboard, their own
-- attendance, and Appointments. Nurse had exactly one permission row in the
-- whole table and would have signed in to a blank app; Therapist carried
-- patients, photos, procedures and the masters from an earlier guess that was
-- never used by anybody.
--
-- Everything off first, then the three they were asked for. Doing it this way
-- rather than naming what to remove means a module added later is off for
-- them by default, which is the safe direction.

update public.role_module_permissions p
   set can_view = false, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and lower(r.name) in ('nurse','therapist');

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, m.module_key, m.can_view, m.can_create, m.can_edit, false
  from public.user_roles_config r
 cross join (values
   -- the landing page, and their own working day on it
   ('dashboard',   true, false, false),
   ('attendance',  true, true,  false),
   -- Appointments: edit so the detail sheet saves, no create and no delete -
   -- booking and cancelling stay with reception and the doctors. Notes live in
   -- appointment_sticky_notes and need nothing from this row.
   ('appointments', true, false, true)
 ) as m(module_key, can_view, can_create, can_edit)
 where lower(r.name) in ('nurse','therapist')
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- ── 4. The leave tables ──
--
-- Same shape as attendance_records has had since 20261102140000: your own rows,
-- unless you are an admin.
--
-- One deliberate difference, in the insert policy. The published Leave page is
-- an admin console whose Apply Leave form makes you pick a staff member from a
-- dropdown of everyone, so an admin applying on somebody's behalf is a flow the
-- clinic uses today. `is_admin_user() or staff_id = current_staff_id()` keeps
-- it working; a bare own-rows check would have broken it with no deploy.
--
-- The helper calls are wrapped in (SELECT ...) on the lesson recorded in
-- 20260910160000: hoisted, Postgres runs them once per query instead of once
-- per row - 7ms against 874ms over 50k rows there.

do $leave$
declare t text;
begin
  foreach t in array array['leave_applications','leave_types','staff_leave_balances'] loop
    execute format('drop policy if exists "Authenticated staff can read %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Authenticated staff can insert %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Authenticated staff can update %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Authenticated staff can delete %1$s" on public.%1$I', t);
  end loop;
end
$leave$;

drop policy if exists "Staff read own leave, admins read all" on public.leave_applications;
create policy "Staff read own leave, admins read all"
  on public.leave_applications for select to authenticated
  using ((select public.is_admin_user()) or staff_id = (select public.current_staff_id()));

drop policy if exists "Staff apply for their own leave" on public.leave_applications;
create policy "Staff apply for their own leave"
  on public.leave_applications for insert to authenticated
  with check ((select public.is_admin_user()) or staff_id = (select public.current_staff_id()));

drop policy if exists "Only admins decide leave" on public.leave_applications;
create policy "Only admins decide leave"
  on public.leave_applications for update to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

drop policy if exists "Only admins delete leave" on public.leave_applications;
create policy "Only admins delete leave"
  on public.leave_applications for delete to authenticated
  using ((select public.is_admin_user()));

-- Leave types and balances stay readable by every signed-in staff member - a
-- balance nobody can read is a balance the app cannot show them - and writable
-- only by admins.
drop policy if exists "Signed-in staff read leave types" on public.leave_types;
create policy "Signed-in staff read leave types"
  on public.leave_types for select to authenticated using (true);

drop policy if exists "Only admins change leave types" on public.leave_types;
create policy "Only admins change leave types"
  on public.leave_types for all to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

drop policy if exists "Staff read own balance, admins read all" on public.staff_leave_balances;
create policy "Staff read own balance, admins read all"
  on public.staff_leave_balances for select to authenticated
  using ((select public.is_admin_user()) or staff_id = (select public.current_staff_id()));

drop policy if exists "Only admins change leave balances" on public.staff_leave_balances;
create policy "Only admins change leave balances"
  on public.staff_leave_balances for all to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));
