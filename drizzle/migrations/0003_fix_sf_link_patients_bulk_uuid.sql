CREATE OR REPLACE FUNCTION public.sf_link_patients_bulk(payload jsonb)
RETURNS TABLE(linked integer, created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked integer := 0;
  v_created integer := 0;
BEGIN
  CREATE TEMP TABLE _sf_batch ON COMMIT DROP AS
  SELECT DISTINCT ON (x.sf_id)
         x.sf_id,
         COALESCE(NULLIF(btrim(x.name), ''), 'Unknown') AS name,
         NULLIF(x.phone, '') AS phone
  FROM jsonb_to_recordset(payload) AS x(sf_id text, name text, phone text);

  DELETE FROM _sf_batch b USING public.patients p WHERE p.sf_id = b.sf_id;

  WITH cand AS (
    SELECT b.sf_id, (array_agg(p.id ORDER BY p.id))[1] AS patient_id, COUNT(*) AS n
    FROM _sf_batch b
    JOIN public.patients p
      ON b.phone IS NOT NULL
     AND p.sf_id IS NULL
     AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 10) = b.phone
    GROUP BY b.sf_id
    HAVING COUNT(*) = 1
  ), uniq AS (
    SELECT DISTINCT ON (patient_id) sf_id, patient_id FROM cand ORDER BY patient_id, sf_id
  ), upd AS (
    UPDATE public.patients p SET sf_id = u.sf_id
    FROM uniq u WHERE p.id = u.patient_id AND p.sf_id IS NULL
    RETURNING u.sf_id
  )
  DELETE FROM _sf_batch b USING upd WHERE b.sf_id = upd.sf_id;
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  INSERT INTO public.patients (first_name, last_name, phone, sf_id, source)
  SELECT split_part(b.name, ' ', 1),
         COALESCE(NULLIF(btrim(substr(b.name, length(split_part(b.name, ' ', 1)) + 1)), ''), ''),
         b.phone,
         b.sf_id,
         'salesforce'
  FROM _sf_batch b;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  DROP TABLE _sf_batch;
  RETURN QUERY SELECT v_linked, v_created;
END;
$$;

REVOKE ALL ON FUNCTION public.sf_link_patients_bulk(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sf_link_patients_bulk(jsonb) TO service_role;