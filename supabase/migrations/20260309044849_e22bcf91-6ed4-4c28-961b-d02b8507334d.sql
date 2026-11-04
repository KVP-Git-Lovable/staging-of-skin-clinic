
-- Clinic settings table
CREATE TABLE public.clinic_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'DermaCare Clinic',
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  email text,
  logo_url text,
  gst_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view clinic_settings" ON public.clinic_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update clinic_settings" ON public.clinic_settings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert clinic_settings" ON public.clinic_settings FOR INSERT TO authenticated WITH CHECK (true);

-- Working hours table
CREATE TABLE public.working_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  is_open boolean NOT NULL DEFAULT true,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '18:00',
  break_start time,
  break_end time,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(day_of_week)
);

ALTER TABLE public.working_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view working_hours" ON public.working_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can update working_hours" ON public.working_hours FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert working_hours" ON public.working_hours FOR INSERT TO authenticated WITH CHECK (true);

-- Staff roles table  
CREATE TABLE public.staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  permissions text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view staff_roles" ON public.staff_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can manage staff_roles" ON public.staff_roles FOR ALL TO authenticated USING (true);

-- Insert default working hours
INSERT INTO public.working_hours (day_of_week, is_open, open_time, close_time) VALUES
(0, false, '09:00', '18:00'),
(1, true, '09:00', '18:00'),
(2, true, '09:00', '18:00'),
(3, true, '09:00', '18:00'),
(4, true, '09:00', '18:00'),
(5, true, '09:00', '18:00'),
(6, true, '09:00', '14:00');

-- Insert default roles
INSERT INTO public.staff_roles (name, description, permissions) VALUES
('Doctor', 'Medical practitioner', ARRAY['view_patients', 'create_procedures', 'prescribe']),
('Nurse', 'Medical support staff', ARRAY['view_patients', 'view_procedures']),
('Receptionist', 'Front desk staff', ARRAY['view_patients', 'manage_appointments', 'billing']),
('Admin', 'Full access administrator', ARRAY['all']);
