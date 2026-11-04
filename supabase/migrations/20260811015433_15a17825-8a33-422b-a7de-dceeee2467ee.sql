CREATE TABLE public.custom_field_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL,
  name text NOT NULL,
  description text,
  column_count integer NOT NULL DEFAULT 2,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_field_sections TO authenticated;
GRANT SELECT ON public.custom_field_sections TO anon;
GRANT ALL ON public.custom_field_sections TO service_role;
ALTER TABLE public.custom_field_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all custom_field_sections" ON public.custom_field_sections FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon read custom_field_sections" ON public.custom_field_sections FOR SELECT TO anon USING (true);

CREATE TABLE public.custom_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL,
  section_id uuid REFERENCES public.custom_field_sections(id) ON DELETE SET NULL,
  column_name text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  default_value text,
  help_text text,
  placeholder text,
  max_length integer,
  decimal_places integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_key, column_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_fields TO authenticated;
GRANT SELECT ON public.custom_fields TO anon;
GRANT ALL ON public.custom_fields TO service_role;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all custom_fields" ON public.custom_fields FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon read custom_fields" ON public.custom_fields FOR SELECT TO anon USING (true);

CREATE TRIGGER update_custom_field_sections_updated_at BEFORE UPDATE ON public.custom_field_sections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_custom_fields_updated_at BEFORE UPDATE ON public.custom_fields FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.add_custom_field_column(_table text, _column text, _sql_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _table NOT IN ('patients','appointments','procedures','invoices','pharma_products') THEN
    RAISE EXCEPTION 'Unsupported object: %', _table;
  END IF;
  IF _column !~ '^cf_[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid column name: %', _column;
  END IF;
  IF _sql_type NOT IN ('text','text[]','integer','numeric','boolean','date','timestamptz') THEN
    RAISE EXCEPTION 'Unsupported field type: %', _sql_type;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s', _table, _column, _sql_type);
END;
$$;

CREATE OR REPLACE FUNCTION public.drop_custom_field_column(_table text, _column text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _table NOT IN ('patients','appointments','procedures','invoices','pharma_products') THEN
    RAISE EXCEPTION 'Unsupported object: %', _table;
  END IF;
  IF _column !~ '^cf_[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid column name: %', _column;
  END IF;
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', _table, _column);
END;
$$;

REVOKE ALL ON FUNCTION public.add_custom_field_column(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drop_custom_field_column(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_custom_field_column(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.drop_custom_field_column(text, text) TO authenticated, service_role;