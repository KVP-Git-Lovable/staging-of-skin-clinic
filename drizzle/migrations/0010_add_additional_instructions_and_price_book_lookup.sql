ALTER TABLE public.procedures ADD COLUMN IF NOT EXISTS additional_instructions TEXT;

CREATE TABLE IF NOT EXISTS public.sf_price_book_entries (
  sf_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  service_name TEXT,
  price_book_name TEXT,
  unit_price NUMERIC,
  gst_rate NUMERIC,
  is_active BOOLEAN,
  sf_created_at TIMESTAMPTZ,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sf_price_book_entries_code_key ON public.sf_price_book_entries (code);

GRANT SELECT ON public.sf_price_book_entries TO authenticated;
GRANT ALL ON public.sf_price_book_entries TO service_role;

ALTER TABLE public.sf_price_book_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read price book entries"
ON public.sf_price_book_entries
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX IF NOT EXISTS prescriptions_procedure_medicine_idx
ON public.prescriptions (procedure_id, medicine_name);