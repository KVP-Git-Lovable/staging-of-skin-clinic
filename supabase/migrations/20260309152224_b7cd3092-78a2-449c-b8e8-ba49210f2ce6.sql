
-- Services master table
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'General',
  price numeric NOT NULL DEFAULT 0,
  duration integer NOT NULL DEFAULT 30,
  diagnosis text,
  procedure_notes text,
  recommendations text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read services" ON public.services FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert services" ON public.services FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update services" ON public.services FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete services" ON public.services FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read services" ON public.services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert services" ON public.services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update services" ON public.services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete services" ON public.services FOR DELETE TO authenticated USING (true);

-- Service medicines linking table
CREATE TABLE public.service_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  frequency text,
  duration text,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_medicines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read service_medicines" ON public.service_medicines FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert service_medicines" ON public.service_medicines FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update service_medicines" ON public.service_medicines FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete service_medicines" ON public.service_medicines FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read service_medicines" ON public.service_medicines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert service_medicines" ON public.service_medicines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update service_medicines" ON public.service_medicines FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete service_medicines" ON public.service_medicines FOR DELETE TO authenticated USING (true);

-- Add recommendations column to procedures table
ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS recommendations text;
