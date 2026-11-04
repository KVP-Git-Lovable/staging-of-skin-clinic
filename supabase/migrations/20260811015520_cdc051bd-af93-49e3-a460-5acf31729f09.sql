CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    LEFT JOIN public.user_roles_config r ON r.id = s.role_id
    WHERE s.auth_user_id = auth.uid()
      AND COALESCE(s.is_active, true)
      AND (lower(coalesce(r.name, '')) = 'admin' OR lower(coalesce(s.role, '')) = 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_staff() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_custom_field_column(_table text, _column text, _sql_type text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'Only administrators can create custom fields';
  END IF;
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
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'Only administrators can delete custom fields';
  END IF;
  IF _table NOT IN ('patients','appointments','procedures','invoices','pharma_products') THEN
    RAISE EXCEPTION 'Unsupported object: %', _table;
  END IF;
  IF _column !~ '^cf_[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid column name: %', _column;
  END IF;
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', _table, _column);
END;
$$;