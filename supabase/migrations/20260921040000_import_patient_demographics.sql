-- Import the demographics Salesforce has held all along.
--
-- Every Salesforce query this app makes for a patient asks for exactly three
-- fields: Id, Patient_Name__c, Mobile_Number__c. Gender, email and date of
-- birth have never been fetched, not once - which is why a printed prescription
-- reads "Sex: -" and "Email: -". Measured over 120 sampled Patient__c records,
-- Salesforce holds Sex__c for 100% of patients and Email_ID__c for 96.7%, while
-- this database has gender for 63.7% and email for 60.6%.
--
-- Date of birth is the one to be careful with, and the reason every write here
-- is fill-only: Salesforce has it for just 6.7% of patients while we hold it for
-- 29.2% (7,916 patients), almost all typed in here or carried from the April
-- spreadsheet. A plain overwrite would erase thousands of real birth dates to
-- write nulls. So a value already in this database always wins, and a null from
-- Salesforce can never blank one.
--
-- Salesforce's Alternate_Number__c is deliberately not imported: it is filled
-- for 2.5% of patients and there is no column here that means the same thing
-- (emergency_contact_phone is a different fact, not a second mobile number).
--
-- Nothing is overwritten by this migration. It adds the backup table and the
-- setter; the edge function sf-import-demographics does the work.

-- Snapshot the three columns before anything fills them, so a bad import can be
-- undone row by row.
CREATE TABLE IF NOT EXISTS public.patients_demographics_backup_20260921 AS
SELECT id, sf_id, gender, email, date_of_birth, now() AS captured_at
  FROM public.patients
 WHERE sf_id IS NOT NULL;

COMMENT ON TABLE public.patients_demographics_backup_20260921 IS
  'patients.gender/email/date_of_birth as they stood before the Salesforce demographics import of 2026-09-21. Restore source.';

-- Fills gender, email and date of birth for a batch of Salesforce patients.
-- Input: jsonb array of {sf_id, gender, email, date_of_birth}, already
-- normalised by the edge function.
--
-- FILL-ONLY. Each column is COALESCEd against what is already here, so:
--   * a value typed in this app is never replaced
--   * a null or blank from Salesforce can never erase one
--   * a re-run is a no-op
-- The row is only touched at all when at least one column would gain a value,
-- which keeps updated_at and the field-history trigger quiet on the rest.
--
-- gender is checked against patients_gender_check here as well as in the edge
-- function: an unexpected Sex__c value must skip that one column, not fail the
-- whole batch and strand the import mid-run.
CREATE OR REPLACE FUNCTION public.sf_set_patient_demographics_bulk(payload jsonb)
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
           CASE WHEN btrim(COALESCE(x.gender, '')) IN ('Male', 'Female', 'Other', 'Prefer not to say')
                THEN btrim(x.gender) END AS gender,
           NULLIF(btrim(COALESCE(x.email, '')), '') AS email,
           x.date_of_birth
      FROM jsonb_to_recordset(payload) AS x(sf_id text, gender text, email text, date_of_birth date)
     WHERE x.sf_id IS NOT NULL
  ), upd AS (
    UPDATE public.patients p
       SET gender        = COALESCE(NULLIF(btrim(COALESCE(p.gender, '')), ''), b.gender),
           email         = COALESCE(NULLIF(btrim(COALESCE(p.email, '')), ''), b.email),
           date_of_birth = COALESCE(p.date_of_birth, b.date_of_birth)
      FROM batch b
     WHERE p.sf_id = b.sf_id
       AND ( (NULLIF(btrim(COALESCE(p.gender, '')), '') IS NULL AND b.gender        IS NOT NULL)
          OR (NULLIF(btrim(COALESCE(p.email,  '')), '') IS NULL AND b.email         IS NOT NULL)
          OR (p.date_of_birth                           IS NULL AND b.date_of_birth IS NOT NULL) )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;
