CREATE OR REPLACE FUNCTION private.add_custom_field_column(_table text, _column text, _sql_type text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.is_admin_staff() THEN
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
$function$;

CREATE OR REPLACE FUNCTION private.drop_custom_field_column(_table text, _column text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.is_admin_staff() THEN
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
$function$;

REVOKE ALL ON FUNCTION private.add_custom_field_column(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.drop_custom_field_column(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.add_custom_field_column(text,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.drop_custom_field_column(text,text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.add_custom_field_column(text,text,text);
DROP FUNCTION IF EXISTS public.drop_custom_field_column(text,text);

CREATE OR REPLACE FUNCTION public.add_custom_field_column(_table text, _column text, _sql_type text)
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM private.add_custom_field_column(_table, _column, _sql_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.drop_custom_field_column(_table text, _column text)
 RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM private.drop_custom_field_column(_table, _column);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_custom_field_column(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drop_custom_field_column(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_custom_field_column(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drop_custom_field_column(text,text) TO authenticated;