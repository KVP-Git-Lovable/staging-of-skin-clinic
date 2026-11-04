
-- Unit Master table
CREATE TABLE public.unit_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.unit_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all unit_master" ON public.unit_master FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all unit_master" ON public.unit_master FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Category Master table
CREATE TABLE public.category_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.category_master ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon all category_master" ON public.category_master FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all category_master" ON public.category_master FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed default units
INSERT INTO public.unit_master (name) VALUES ('Nos'), ('Strip'), ('Box'), ('Bottle'), ('Tube'), ('Sachet'), ('Vial'), ('Ampoule');

-- Seed default categories
INSERT INTO public.category_master (name) VALUES ('General'), ('Skincare'), ('Haircare'), ('Supplements'), ('Cosmetics'), ('OTC'), ('Prescription');

-- Add columns to pharma_products
ALTER TABLE public.pharma_products ADD COLUMN vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL;
ALTER TABLE public.pharma_products ADD COLUMN expiry_date date;
ALTER TABLE public.pharma_products ADD COLUMN qty_per_unit integer DEFAULT 1;
