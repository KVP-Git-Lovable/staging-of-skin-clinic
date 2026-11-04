
-- Leave types master table
CREATE TABLE public.leave_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  default_days_per_year numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leave_types" ON public.leave_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create leave_types" ON public.leave_types FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leave_types" ON public.leave_types FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete leave_types" ON public.leave_types FOR DELETE TO authenticated USING (true);

-- Staff leave balances (opening/granted per year)
CREATE TABLE public.staff_leave_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  opening_balance numeric NOT NULL DEFAULT 0,
  used numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(staff_id, leave_type_id, year)
);

ALTER TABLE public.staff_leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view staff_leave_balances" ON public.staff_leave_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create staff_leave_balances" ON public.staff_leave_balances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update staff_leave_balances" ON public.staff_leave_balances FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete staff_leave_balances" ON public.staff_leave_balances FOR DELETE TO authenticated USING (true);

-- Leave applications
CREATE TABLE public.leave_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES public.leave_types(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days numeric NOT NULL DEFAULT 1,
  reason text,
  status text NOT NULL DEFAULT 'Pending',
  approved_by uuid REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.leave_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view leave_applications" ON public.leave_applications FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create leave_applications" ON public.leave_applications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update leave_applications" ON public.leave_applications FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete leave_applications" ON public.leave_applications FOR DELETE TO authenticated USING (true);
