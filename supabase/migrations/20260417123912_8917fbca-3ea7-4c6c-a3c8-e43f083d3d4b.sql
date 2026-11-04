CREATE TABLE public.tax_master_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_id uuid NOT NULL,
  service_id uuid NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tax_id, service_id)
);

ALTER TABLE public.tax_master_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read tax_master_services" ON public.tax_master_services FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert tax_master_services" ON public.tax_master_services FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update tax_master_services" ON public.tax_master_services FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete tax_master_services" ON public.tax_master_services FOR DELETE TO anon USING (true);

CREATE POLICY "Auth read tax_master_services" ON public.tax_master_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert tax_master_services" ON public.tax_master_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update tax_master_services" ON public.tax_master_services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete tax_master_services" ON public.tax_master_services FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_tax_master_services_tax_id ON public.tax_master_services(tax_id);
CREATE INDEX idx_tax_master_services_service_id ON public.tax_master_services(service_id);