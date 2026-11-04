-- 1. Audit columns
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','appointments','procedures','invoices','services','pharma_products','pharma_bills','expenses','assets','vendors','staff','doctors','campaigns','prescriptions','tax_master','hsn_tax_master','survey_templates']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by uuid', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by uuid', t);
  END LOOP;
END $$;

-- 2. Config tables
CREATE TABLE IF NOT EXISTS public.history_tracking_config (
  object_key text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT true,
  tracked_fields text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.history_tracking_config TO authenticated;
GRANT ALL ON public.history_tracking_config TO service_role;
ALTER TABLE public.history_tracking_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage history config" ON public.history_tracking_config
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER history_tracking_config_updated_at BEFORE UPDATE ON public.history_tracking_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.field_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  record_id uuid NOT NULL,
  field_name text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS field_history_record_idx ON public.field_history (object_type, record_id, changed_at DESC);
GRANT SELECT, INSERT ON public.field_history TO authenticated;
GRANT ALL ON public.field_history TO service_role;
ALTER TABLE public.field_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read field history" ON public.field_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert field history" ON public.field_history FOR INSERT TO authenticated WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.currency_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  symbol text NOT NULL DEFAULT '₹',
  show_decimals boolean NOT NULL DEFAULT false,
  decimal_digits integer NOT NULL DEFAULT 2,
  number_style text NOT NULL DEFAULT 'indian',
  abbreviate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.currency_settings TO authenticated;
GRANT ALL ON public.currency_settings TO service_role;
ALTER TABLE public.currency_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage currency settings" ON public.currency_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER currency_settings_updated_at BEFORE UPDATE ON public.currency_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.currency_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3. Stamp created_by / updated_by
CREATE OR REPLACE FUNCTION public.stamp_audit_user()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(auth.uid(), OLD.updated_by);
  END IF;
  RETURN NEW;
END;
$$;

-- 4. Field history logger
CREATE OR REPLACE FUNCTION public.log_field_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.history_tracking_config;
  f text;
  old_j jsonb := to_jsonb(OLD);
  new_j jsonb := to_jsonb(NEW);
  ov text; nv text;
  actor uuid := auth.uid();
  actor_name text;
BEGIN
  SELECT * INTO cfg FROM public.history_tracking_config WHERE object_key = TG_TABLE_NAME;
  IF NOT FOUND OR cfg.is_enabled IS NOT TRUE OR array_length(cfg.tracked_fields, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT email INTO actor_name FROM auth.users WHERE id = actor;

  FOREACH f IN ARRAY cfg.tracked_fields LOOP
    ov := old_j ->> f;
    nv := new_j ->> f;
    IF ov IS DISTINCT FROM nv THEN
      INSERT INTO public.field_history (object_type, record_id, field_name, old_value, new_value, changed_by, changed_by_name)
      VALUES (TG_TABLE_NAME, NEW.id, f, ov, nv, actor, actor_name);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Attach triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','appointments','procedures','invoices','services','pharma_products','pharma_bills','expenses','assets','vendors','staff','doctors','campaigns','prescriptions','tax_master','hsn_tax_master','survey_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS stamp_audit_user ON public.%I', t);
    EXECUTE format('CREATE TRIGGER stamp_audit_user BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_user()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS log_field_history ON public.%I', t);
    EXECUTE format('CREATE TRIGGER log_field_history AFTER UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_field_history()', t);
  END LOOP;
END $$;