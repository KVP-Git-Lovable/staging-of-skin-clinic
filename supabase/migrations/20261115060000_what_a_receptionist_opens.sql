-- What a receptionist, and a pharmacist, can open.
--
-- The clinic gave the brief when therapist and nurse logins were set up:
-- receptionists get the dashboard with only their own attendance on it, plus
-- the Employee module to apply for leave and regularisations. Therapist and
-- Nurse were narrowed then; Receptionist and Pharmacist were not, and nobody
-- noticed until a receptionist signed in and saw the whole app.
--
-- It was not only visibility. Receptionist carried can_delete on patients,
-- billing, appointments, procedures, staff and services, and three people now
-- hold that account.
--
--   before   Receptionist 27 modules, Pharmacist 10
--   after    both: dashboard, attendance, leave
--
-- Doctor and Admin are deliberately untouched - "same as now plus check in
-- and out" is what was asked for there.
--
-- Rows are set to all-false rather than deleted, so Roles & Permissions still
-- lists every module with a box to tick back on. Idempotent and keyed on the
-- role NAME, so re-running it is harmless and a rebuilt environment matches
-- the live one. Already applied live on 13 Nov; this records it.
--
-- No schema change, so the published build is unaffected: these flags only
-- decide what the client offers, and the row-level policies that protect
-- patient data never depended on them.

-- Everything that is not one of the three.
update public.role_module_permissions p
   set can_view = false, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name in ('Receptionist', 'Pharmacist')
   and p.module_key not in ('dashboard', 'attendance', 'leave');

-- The dashboard, to look at. dashboard_clinic and dashboard_my_appointments
-- stay off above, and their absence is exactly what makes dashboardScope()
-- return "attendance_only" - the check-in-and-out dashboard built for this.
update public.role_module_permissions p
   set can_view = true, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name in ('Receptionist', 'Pharmacist')
   and p.module_key = 'dashboard';

-- Attendance and leave, with create: marking your own day and applying for
-- your own leave are both inserts. Same shape Therapist and Nurse carry.
update public.role_module_permissions p
   set can_view = true, can_create = true, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name in ('Receptionist', 'Pharmacist')
   and p.module_key in ('attendance', 'leave');
