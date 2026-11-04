
-- Add website column to vendors
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS website text;

-- Create vendor_contacts table
CREATE TABLE public.vendor_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vendor_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read vendor_contacts" ON public.vendor_contacts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon insert vendor_contacts" ON public.vendor_contacts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update vendor_contacts" ON public.vendor_contacts FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete vendor_contacts" ON public.vendor_contacts FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read vendor_contacts" ON public.vendor_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert vendor_contacts" ON public.vendor_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update vendor_contacts" ON public.vendor_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete vendor_contacts" ON public.vendor_contacts FOR DELETE TO authenticated USING (true);
