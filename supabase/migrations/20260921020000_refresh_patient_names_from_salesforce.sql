-- Let patient names be corrected from Salesforce.
--
-- The 23 April bulk load created patients with the names in that file.
-- sf_link_patients_bulk then attached Salesforce ids by matching phone numbers,
-- but it only ever writes sf_id - it never touches the name. So 17,194 patients
-- display the name the bulk file gave them while Salesforce holds a different
-- one, which is why a patient reads "Shizan" there and "Suzna" here.
--
-- Nothing is overwritten by this migration. It adds the backup table and the
-- setter; the edge function sf-refresh-patient-names does the work, and only for
-- rows where the name actually differs.

-- Snapshot every linked patient's current name before anything changes it, so a
-- bad refresh can be undone row by row.
CREATE TABLE IF NOT EXISTS public.patients_name_backup_20260921 AS
SELECT id, sf_id, first_name, last_name, now() AS captured_at
  FROM public.patients
 WHERE sf_id IS NOT NULL;

COMMENT ON TABLE public.patients_name_backup_20260921 IS
  'Patient names as they stood before the Salesforce name refresh of 2026-09-21. Restore source.';

-- Sets first/last name for a batch of Salesforce patients.
-- Input: jsonb array of {sf_id, name} where name is Patient_Name__c verbatim.
--
-- Splits exactly as sf_link_patients_bulk does on insert (first word, then the
-- rest), so a refreshed name is indistinguishable from an imported one. Writes
-- only those two columns, only onto rows whose sf_id already matches, and only
-- where the result differs - so a re-run is a no-op and nothing else on the
-- patient can be touched.
CREATE OR REPLACE FUNCTION public.sf_set_patient_name_bulk(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH batch AS (
    SELECT DISTINCT ON (x.sf_id)
           x.sf_id,
           split_part(btrim(x.name), ' ', 1) AS fn,
           COALESCE(NULLIF(btrim(substr(btrim(x.name), length(split_part(btrim(x.name), ' ', 1)) + 1)), ''), '') AS ln
      FROM jsonb_to_recordset(payload) AS x(sf_id text, name text)
     WHERE x.sf_id IS NOT NULL
       AND btrim(COALESCE(x.name, '')) <> ''
  ), upd AS (
    UPDATE public.patients p
       SET first_name = b.fn,
           last_name  = b.ln
      FROM batch b
     WHERE p.sf_id = b.sf_id
       AND (p.first_name IS DISTINCT FROM b.fn OR COALESCE(p.last_name, '') IS DISTINCT FROM b.ln)
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sf_set_patient_name_bulk(jsonb) FROM PUBLIC, anon, authenticated;
