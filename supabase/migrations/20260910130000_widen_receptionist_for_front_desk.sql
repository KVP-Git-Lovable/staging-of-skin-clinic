-- Make Receptionist the front-desk role, rather than adding a second one beside it.
--
-- Receptionist is already described as "Front desk with patient and billing access",
-- so it is the same role in intent. Its seeded permissions were much narrower than
-- the front-desk account actually needs though - only 5 modules, and Reports denied
-- outright - so they are widened here.
--
-- Why the account needs to come off Admin at all: isAdmin (role name = 'admin')
-- bypasses every module permission check, so while the front-desk account held the
-- Admin role it could always open Report Builder or Dashboards and read a month or a
-- year there, whatever the day-at-a-time limit did to the Reports screens.
--
-- NOTE: this widens Receptionist for everyone already assigned to it.

-- 1. Dashboards gets its own module key ------------------------------------------
-- It used to be gated on 'reports', which makes "daily reports but no dashboards"
-- impossible to express. Seed the new key from each role's existing 'reports' row so
-- no role's current access changes; a role with no 'reports' row stays without both.

INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
SELECT role_id, 'dashboards', can_view, can_create, can_edit, can_delete
  FROM public.role_module_permissions
 WHERE module_key = 'reports'
ON CONFLICT (role_id, module_key) DO NOTHING;

-- 2. Widen Receptionist -------------------------------------------------------------
-- data_scope stays 'all': front desk works across every doctor.

UPDATE public.user_roles_config
   SET description = 'Front desk / clinic manager. Full day-to-day access across all doctors; reporting is limited to one day at a time.',
       data_scope = 'all'
 WHERE name = 'Receptionist';

-- Everything needed day to day, at full create/edit/delete. Deliberately excluded,
-- and each one is a checkbox away in User Management if that is wrong:
--   report_builder  - would allow building an arbitrary query over any table, which
--                     is precisely the monthly/annual view the day limit prevents
--   dashboards      - same, via pinned monthly charts
--   user_management - an account that can edit roles can lift its own restriction

DO $$
DECLARE
  _role_id uuid;
  _granted text[] := ARRAY[
    'dashboard', 'patients', 'appointments', 'procedures', 'photos', 'pharmacy',
    'billing', 'leave', 'assets', 'portal_orders', 'campaigns', 'expenses', 'staff',
    'problem_areas', 'reports', 'surveys', 'services', 'vendors', 'unit_master',
    'category_master', 'settings'
  ];
  _denied text[] := ARRAY['report_builder', 'dashboards', 'user_management'];
  _k text;
BEGIN
  SELECT id INTO _role_id FROM public.user_roles_config WHERE name = 'Receptionist';
  IF _role_id IS NULL THEN
    RAISE EXCEPTION 'Receptionist role not found - nothing to widen';
  END IF;

  FOREACH _k IN ARRAY _granted LOOP
    INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
    VALUES (_role_id, _k, true, true, true, true)
    ON CONFLICT (role_id, module_key)
    DO UPDATE SET can_view = true, can_create = true, can_edit = true, can_delete = true;
  END LOOP;

  FOREACH _k IN ARRAY _denied LOOP
    INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
    VALUES (_role_id, _k, false, false, false, false)
    ON CONFLICT (role_id, module_key)
    DO UPDATE SET can_view = false, can_create = false, can_edit = false, can_delete = false;
  END LOOP;
END $$;

-- 3. Retire the Front Desk role, if an earlier version of this change created it ----
-- Move anyone on it across first: staff.role_id is ON DELETE SET NULL, so dropping
-- the role out from under them would leave them with no role and no access at all.

UPDATE public.staff
   SET role_id = (SELECT id FROM public.user_roles_config WHERE name = 'Receptionist')
 WHERE role_id = (SELECT id FROM public.user_roles_config WHERE name = 'Front Desk');

DELETE FROM public.user_roles_config WHERE name = 'Front Desk';

-- 4. Move the front-desk account onto Receptionist ---------------------------------
-- The day-at-a-time reporting limit is set separately on the staff row, and is
-- unaffected by this.

UPDATE public.staff
   SET role_id = (SELECT id FROM public.user_roles_config WHERE name = 'Receptionist')
 WHERE lower(email) = 'theskinclinic30@gmail.com';
