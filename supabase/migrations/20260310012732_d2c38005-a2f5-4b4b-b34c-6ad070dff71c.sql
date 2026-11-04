
-- Vendors table
CREATE TABLE public.vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  gst_number text,
  category text DEFAULT 'General',
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read vendors" ON public.vendors FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert vendors" ON public.vendors FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update vendors" ON public.vendors FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete vendors" ON public.vendors FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read vendors" ON public.vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert vendors" ON public.vendors FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update vendors" ON public.vendors FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete vendors" ON public.vendors FOR DELETE TO authenticated USING (true);

-- Assets table
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  asset_code text,
  category text NOT NULL DEFAULT 'Equipment',
  description text,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  purchase_date date,
  purchase_price numeric DEFAULT 0,
  invoice_number text,
  serial_number text,
  model_number text,
  manufacturer text,
  location text,
  warranty_start_date date,
  warranty_end_date date,
  warranty_terms text,
  amc_start_date date,
  amc_end_date date,
  amc_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  amc_cost numeric DEFAULT 0,
  amc_terms text,
  status text NOT NULL DEFAULT 'Active',
  condition text DEFAULT 'Good',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read assets" ON public.assets FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert assets" ON public.assets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update assets" ON public.assets FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete assets" ON public.assets FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read assets" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert assets" ON public.assets FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update assets" ON public.assets FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete assets" ON public.assets FOR DELETE TO authenticated USING (true);

-- Asset Issues table
CREATE TABLE public.asset_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'Medium',
  status text NOT NULL DEFAULT 'Open',
  reported_by text,
  reported_date timestamp with time zone NOT NULL DEFAULT now(),
  resolved_date timestamp with time zone,
  resolution_notes text,
  cost numeric DEFAULT 0,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.asset_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read asset_issues" ON public.asset_issues FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert asset_issues" ON public.asset_issues FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update asset_issues" ON public.asset_issues FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete asset_issues" ON public.asset_issues FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read asset_issues" ON public.asset_issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert asset_issues" ON public.asset_issues FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update asset_issues" ON public.asset_issues FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete asset_issues" ON public.asset_issues FOR DELETE TO authenticated USING (true);

-- Asset-Service link table
CREATE TABLE public.asset_service_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  is_required boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(asset_id, service_id)
);

ALTER TABLE public.asset_service_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read asset_service_links" ON public.asset_service_links FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert asset_service_links" ON public.asset_service_links FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update asset_service_links" ON public.asset_service_links FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete asset_service_links" ON public.asset_service_links FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read asset_service_links" ON public.asset_service_links FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert asset_service_links" ON public.asset_service_links FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update asset_service_links" ON public.asset_service_links FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete asset_service_links" ON public.asset_service_links FOR DELETE TO authenticated USING (true);
