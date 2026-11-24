-- What a Manager can open: the same as a receptionist.
--
-- The role was created in Roles & Permissions on 13 Nov at 17:26 and assigned
-- to one person who had no login yet. It arrived unconfigured - the only flag
-- switched on was billing_amounts, which is not a page at all but the
-- "untick to hide" control on billing figures, on because defaultsToVisible()
-- in src/lib/modules.ts turns it on for every role the screen creates.
--
-- The clinic asked for the same set a receptionist carries, so:
--
--   dashboard               view            (and with dashboard_clinic and
--                                            dashboard_my_appointments left
--                                            off, dashboardScope() gives the
--                                            attendance-only dashboard)
--   attendance   view + create              (marking your own day is an insert)
--   leave        view + create              (applying for your own leave too)
--
-- Receptionist has no billing_amounts row at all, so switching Manager's off
-- lands the two roles on the same effective answer rather than merely a
-- similar one.
--
-- Manager is named nowhere in the code: useAuth treats only the role literally
-- called Admin as an admin, and create-user-account's guard asks the same, so
-- nothing here can make a Manager an administrator.
--
-- Only this role is touched - no other role name appears below, which a test
-- pins, so re-running it cannot disturb what was set for the others.
-- Idempotent and keyed on the role name. Rows are switched off rather than
-- deleted, so Roles & Permissions still lists every module with a box to tick
-- back on. Already applied live on 13 Nov; this records it.
--
-- No schema change, so the published build is unaffected: these flags only
-- decide what the client offers, and the row-level policies that protect
-- patient data never depended on them.

update public.role_module_permissions p
   set can_view = false, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name = 'Manager'
   and p.module_key not in ('dashboard', 'attendance', 'leave');

update public.role_module_permissions p
   set can_view = true, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name = 'Manager'
   and p.module_key = 'dashboard';

update public.role_module_permissions p
   set can_view = true, can_create = true, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and r.name = 'Manager'
   and p.module_key in ('attendance', 'leave');
