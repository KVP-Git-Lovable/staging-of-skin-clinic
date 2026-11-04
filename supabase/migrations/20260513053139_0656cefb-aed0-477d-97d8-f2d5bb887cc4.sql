
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS line_items jsonb,
  ADD COLUMN IF NOT EXISTS doctor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL;

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS hsn_code text,
  ADD COLUMN IF NOT EXISTS gst_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS consultation_fee numeric NOT NULL DEFAULT 0;
