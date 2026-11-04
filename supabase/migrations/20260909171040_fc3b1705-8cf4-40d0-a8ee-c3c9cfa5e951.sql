CREATE OR REPLACE FUNCTION public.get_report_fields()
RETURNS TABLE(table_name text, column_name text, data_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.table_name::text, c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.data_type NOT IN ('ARRAY', 'jsonb', 'json', 'bytea', 'USER-DEFINED')
  ORDER BY c.table_name, c.ordinal_position
$$;

REVOKE ALL ON FUNCTION public.get_report_fields() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_report_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_report_fields() TO service_role;