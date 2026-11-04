-- Tax Master table for managing tax rates
CREATE TABLE public.tax_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  rate NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tax_master ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view tax_master" ON public.tax_master FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create tax_master" ON public.tax_master FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update tax_master" ON public.tax_master FOR UPDATE USING (true);
CREATE POLICY "Authenticated users can delete tax_master" ON public.tax_master FOR DELETE USING (true);

-- Insert default tax rates
INSERT INTO public.tax_master (name, rate, description) VALUES
  ('GST 5%', 5, 'Goods and Services Tax - 5%'),
  ('GST 12%', 12, 'Goods and Services Tax - 12%'),
  ('GST 18%', 18, 'Goods and Services Tax - 18%'),
  ('GST 28%', 28, 'Goods and Services Tax - 28%'),
  ('No Tax', 0, 'Exempt from tax');

-- Add tax columns to invoices table
ALTER TABLE public.invoices 
  ADD COLUMN tax_id UUID REFERENCES public.tax_master(id),
  ADD COLUMN tax_rate NUMERIC DEFAULT 0,
  ADD COLUMN tax_amount NUMERIC DEFAULT 0;

-- Add tax columns to pharma_bills table
ALTER TABLE public.pharma_bills
  ADD COLUMN tax_id UUID REFERENCES public.tax_master(id),
  ADD COLUMN tax_rate NUMERIC DEFAULT 0,
  ADD COLUMN tax_amount NUMERIC DEFAULT 0;