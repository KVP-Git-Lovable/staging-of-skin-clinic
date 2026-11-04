
-- Table 1: role definitions
CREATE TABLE public.user_roles_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all user_roles_config" ON public.user_roles_config FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all user_roles_config" ON public.user_roles_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table 2: module permissions per role
CREATE TABLE public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.user_roles_config(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(role_id, module_key)
);

ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all role_module_permissions" ON public.role_module_permissions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all role_module_permissions" ON public.role_module_permissions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add role_id to doctors
ALTER TABLE public.doctors ADD COLUMN role_id uuid REFERENCES public.user_roles_config(id) ON DELETE SET NULL;

-- Seed default roles
INSERT INTO public.user_roles_config (id, name, description, is_system) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'Full access to all modules', true),
  ('a0000000-0000-0000-0000-000000000002', 'Doctor', 'Clinical staff with patient and procedure access', true),
  ('a0000000-0000-0000-0000-000000000003', 'Receptionist', 'Front desk with patient and billing access', true),
  ('a0000000-0000-0000-0000-000000000004', 'Pharmacist', 'Pharmacy and billing view access', true);

-- All modules list
-- dashboard, patients, appointments, procedures, photos, pharmacy, billing, leave, assets, portal_orders, expenses, staff, problem_areas, reports, report_builder, surveys, services, vendors, unit_master, category_master, settings, user_management

-- Admin: all ON
INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_edit)
SELECT 'a0000000-0000-0000-0000-000000000001', m, true, true
FROM unnest(ARRAY['dashboard','patients','appointments','procedures','photos','pharmacy','billing','leave','assets','portal_orders','expenses','staff','problem_areas','reports','report_builder','surveys','services','vendors','unit_master','category_master','settings','user_management']) AS m;

-- Doctor
INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_edit) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'dashboard', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'patients', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'appointments', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'procedures', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'photos', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'pharmacy', true, false),
  ('a0000000-0000-0000-0000-000000000002', 'reports', true, true),
  ('a0000000-0000-0000-0000-000000000002', 'billing', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'leave', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'assets', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'portal_orders', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'expenses', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'staff', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'problem_areas', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'report_builder', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'surveys', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'services', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'vendors', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'unit_master', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'category_master', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'settings', false, false),
  ('a0000000-0000-0000-0000-000000000002', 'user_management', false, false);

-- Receptionist
INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_edit) VALUES
  ('a0000000-0000-0000-0000-000000000003', 'dashboard', true, true),
  ('a0000000-0000-0000-0000-000000000003', 'patients', true, true),
  ('a0000000-0000-0000-0000-000000000003', 'appointments', true, true),
  ('a0000000-0000-0000-0000-000000000003', 'billing', true, true),
  ('a0000000-0000-0000-0000-000000000003', 'portal_orders', true, true),
  ('a0000000-0000-0000-0000-000000000003', 'procedures', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'photos', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'pharmacy', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'leave', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'assets', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'expenses', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'staff', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'problem_areas', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'reports', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'report_builder', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'surveys', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'services', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'vendors', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'unit_master', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'category_master', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'settings', false, false),
  ('a0000000-0000-0000-0000-000000000003', 'user_management', false, false);

-- Pharmacist
INSERT INTO public.role_module_permissions (role_id, module_key, can_view, can_edit) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'dashboard', true, true),
  ('a0000000-0000-0000-0000-000000000004', 'pharmacy', true, true),
  ('a0000000-0000-0000-0000-000000000004', 'billing', true, false),
  ('a0000000-0000-0000-0000-000000000004', 'patients', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'appointments', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'procedures', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'photos', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'leave', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'assets', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'portal_orders', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'expenses', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'staff', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'problem_areas', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'reports', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'report_builder', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'surveys', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'services', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'vendors', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'unit_master', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'category_master', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'settings', false, false),
  ('a0000000-0000-0000-0000-000000000004', 'user_management', false, false);
