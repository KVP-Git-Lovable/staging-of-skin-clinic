
CREATE TABLE public.doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialization text,
  phone text,
  email text,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.doctors ENABLE ROW LEVEL SECURITY;

-- Anon policies
CREATE POLICY "Allow public read doctors" ON public.doctors FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert doctors" ON public.doctors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update doctors" ON public.doctors FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete doctors" ON public.doctors FOR DELETE TO anon USING (true);

-- Authenticated policies
CREATE POLICY "Auth read doctors" ON public.doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert doctors" ON public.doctors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update doctors" ON public.doctors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete doctors" ON public.doctors FOR DELETE TO authenticated USING (true);

-- Updated_at trigger
CREATE TRIGGER update_doctors_updated_at
BEFORE UPDATE ON public.doctors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
