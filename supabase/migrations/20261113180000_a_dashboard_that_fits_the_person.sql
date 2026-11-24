-- A dashboard that fits the person looking at it.
--
-- Stage 1 decided which pages each role may open. It did not change what the
-- dashboard RENDERS, and src/pages/Index.tsx had no role branching in it at
-- all - in 805 lines the only role-derived value was canSeeBilling, which
-- hides money and nothing else. So a therapist signing in landed on the
-- clinic's whole day: 39 appointments, every doctor's name, the NPS score,
-- the pending invoices.
--
-- Two keys decide it now, rather than a role name in the code. A role name
-- would work today and break the first time the clinic makes a role of their
-- own or renames one; these are ordinary permission rows, so they show up in
-- the User Management matrix for free and somebody can be moved between
-- dashboards without a deploy.
--
--   dashboard_clinic            the clinic's figures - KPIs, charts, the
--                               filter bar, pending invoices
--   dashboard_my_appointments   today's appointments assigned to me
--
-- Neither granted means the person gets their own working day and nothing
-- else, which is what the clinic asked for reception. `dashboard` itself is
-- unchanged and still decides whether the page opens at all.
--
-- Backward-compatible with the published build: permission rows only, no
-- table, column or policy change. The published build does not know these
-- keys, so it goes on rendering what it always did.

-- ── The clinic's figures ──
--
-- Admins and doctors, who the clinic said keep what they have. Receptionist
-- and Pharmacist lose them by their own request - reception was named, and
-- the pharmacist was asked about separately and put alongside them.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'dashboard_clinic',
       lower(r.name) in ('admin','doctor'),
       false,
       lower(r.name) = 'admin',
       lower(r.name) = 'admin'
  from public.user_roles_config r
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;

-- ── My appointments today ──
--
-- Therapists and nurses. Admins and doctors need no row: dashboard_clinic is
-- checked first and wins, and an admin's permission map is empty by design.
--
-- A row is written for every role all the same, because User Management's
-- Save deletes every row for a role and reinserts only the keys listed in
-- src/lib/modules.ts - a key with no row anywhere reads as denied, which is
-- right here, but leaving it absent would mean the matrix showed nothing to
-- tick for the roles that should have it.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'dashboard_my_appointments',
       lower(r.name) in ('therapist','nurse'),
       false, false, false
  from public.user_roles_config r
on conflict (role_id, module_key) do update
  set can_view = excluded.can_view, can_create = excluded.can_create,
      can_edit = excluded.can_edit, can_delete = excluded.can_delete;
