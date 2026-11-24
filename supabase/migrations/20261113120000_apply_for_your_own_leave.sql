-- Apply for your own leave.
--
-- The Leave page was one admin console: every form made you pick a staff
-- member from a dropdown of the whole clinic, and nothing defaulted to
-- whoever was signed in. That was tenable while only three admins and three
-- doctors could sign in. It stops being tenable the moment therapists,
-- nurses and receptionists get their own logins, which is what the previous
-- migration prepared for.
--
-- So the page now has a My Leave tab everybody gets, and the three original
-- tabs - everyone's applications, the balances and the leave types - render
-- only for a role that can view the new leave_admin key.
--
-- The row-level policies did this half already: since 20261113060000 a
-- non-admin reads only their own applications and balances and cannot
-- approve anything. This migration is what stops the UI OFFERING what the
-- database would refuse, which is the difference between a locked door and
-- a locked door with no handle painted on it.
--
-- Backward-compatible with the published build: permission rows only. No
-- table, column or policy changes at all. The published build does not know
-- the leave_admin key, so nothing there reads differently.

-- ── leave: apply for your own ──
--
-- Granted to every role. View and create: amending or withdrawing a decided
-- application is not a thing the screen offers, and the update policy is
-- admins-only regardless.
--
-- Receptionist narrows from view/create/edit/delete, which it has held since
-- the roles were seeded. It keeps applying for leave and loses configuring
-- leave types and approving - both of which the database already refused.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'leave', true, true, lower(r.name) = 'admin', lower(r.name) = 'admin'
  from public.user_roles_config r
 where lower(r.name) in ('admin','doctor','receptionist','pharmacist','nurse','therapist')
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- ── leave_admin: the types, the balances, and deciding ──
--
-- Every role gets a row so that User Management's Save, which deletes every
-- row for a role and reinserts only the keys in src/lib/modules.ts, has one
-- to reinsert. Admins are the only role it is true for.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'leave_admin', lower(r.name) = 'admin', lower(r.name) = 'admin',
       lower(r.name) = 'admin', lower(r.name) = 'admin'
  from public.user_roles_config r
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;
