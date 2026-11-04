
-- Staff education background
CREATE TABLE public.staff_education (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  institution text NOT NULL,
  degree text NOT NULL,
  field_of_study text,
  start_year integer,
  end_year integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_education ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read staff_education" ON public.staff_education FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert staff_education" ON public.staff_education FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update staff_education" ON public.staff_education FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete staff_education" ON public.staff_education FOR DELETE TO anon USING (true);
CREATE POLICY "auth read staff_education" ON public.staff_education FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert staff_education" ON public.staff_education FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update staff_education" ON public.staff_education FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete staff_education" ON public.staff_education FOR DELETE TO authenticated USING (true);

-- Staff work experience
CREATE TABLE public.staff_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  company text NOT NULL,
  title text NOT NULL,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read staff_experience" ON public.staff_experience FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert staff_experience" ON public.staff_experience FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update staff_experience" ON public.staff_experience FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete staff_experience" ON public.staff_experience FOR DELETE TO anon USING (true);
CREATE POLICY "auth read staff_experience" ON public.staff_experience FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert staff_experience" ON public.staff_experience FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update staff_experience" ON public.staff_experience FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete staff_experience" ON public.staff_experience FOR DELETE TO authenticated USING (true);

-- Staff aspirations
CREATE TABLE public.staff_aspirations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  target_date date,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_aspirations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read staff_aspirations" ON public.staff_aspirations FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert staff_aspirations" ON public.staff_aspirations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update staff_aspirations" ON public.staff_aspirations FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete staff_aspirations" ON public.staff_aspirations FOR DELETE TO anon USING (true);
CREATE POLICY "auth read staff_aspirations" ON public.staff_aspirations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert staff_aspirations" ON public.staff_aspirations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update staff_aspirations" ON public.staff_aspirations FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete staff_aspirations" ON public.staff_aspirations FOR DELETE TO authenticated USING (true);

-- Staff requests (support, ideas, feedback)
CREATE TABLE public.staff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'support',
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.staff_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read staff_requests" ON public.staff_requests FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert staff_requests" ON public.staff_requests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update staff_requests" ON public.staff_requests FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete staff_requests" ON public.staff_requests FOR DELETE TO anon USING (true);
CREATE POLICY "auth read staff_requests" ON public.staff_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert staff_requests" ON public.staff_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update staff_requests" ON public.staff_requests FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete staff_requests" ON public.staff_requests FOR DELETE TO authenticated USING (true);
