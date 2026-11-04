-- Create external doctors table for referral doctors not in staff
CREATE TABLE public.external_doctors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  specialization text,
  clinic_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.external_doctors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read external_doctors" ON public.external_doctors FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert external_doctors" ON public.external_doctors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth read external_doctors" ON public.external_doctors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert external_doctors" ON public.external_doctors FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX idx_external_doctors_name ON public.external_doctors(name);
