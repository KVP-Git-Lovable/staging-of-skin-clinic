CREATE TABLE public.hsn_tax_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hsn_code text NOT NULL UNIQUE,
  igst numeric NOT NULL DEFAULT 0,
  cgst numeric NOT NULL DEFAULT 0,
  is_active boolean,
  active_from timestamptz,
  inactive_from timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hsn_tax_master TO authenticated;
GRANT ALL ON public.hsn_tax_master TO service_role;

ALTER TABLE public.hsn_tax_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view hsn tax master"
  ON public.hsn_tax_master FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create hsn tax master"
  ON public.hsn_tax_master FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update hsn tax master"
  ON public.hsn_tax_master FOR UPDATE TO authenticated
  USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff());

CREATE POLICY "Admins can delete hsn tax master"
  ON public.hsn_tax_master FOR DELETE TO authenticated
  USING (public.is_admin_staff());

CREATE OR REPLACE FUNCTION public.hsn_tax_master_stamp_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_active IS TRUE THEN NEW.active_from = now(); END IF;
    IF NEW.is_active IS FALSE THEN NEW.inactive_from = now(); END IF;
  ELSE
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      IF NEW.is_active IS TRUE THEN NEW.active_from = now(); END IF;
      IF NEW.is_active IS FALSE THEN NEW.inactive_from = now(); END IF;
    END IF;
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER hsn_tax_master_stamp_dates
  BEFORE INSERT OR UPDATE ON public.hsn_tax_master
  FOR EACH ROW EXECUTE FUNCTION public.hsn_tax_master_stamp_dates();