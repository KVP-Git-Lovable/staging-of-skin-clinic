-- Reenad Mohammed's date of birth read 05/07/1991 here and 19/05/1990 in
-- Salesforce. He was not alone: 7,575 patients carried a wrong one.
--
-- The shape of it is a date-format mix-up in the original migration. 2,812 are
-- a clean day-and-month transposition - 08/01 stored where 01/08 belonged - and
-- on 4,763 the year moved with it. The stored day is the real month over and
-- over: 23/12/1963 became 1964-11-12, 29/04/2004 became 2006-05-04. Random
-- enough to look like noise, regular enough to be one bad parse.
--
-- sf-import-demographics has been able to read Salesforce's Date_of_birth__c
-- all along. It never corrected any of these, because the function it calls was
-- deliberately fill-only:
--
--     date_of_birth = COALESCE(p.date_of_birth, b.date_of_birth)
--
-- with the reasoning, in its own comment, that "Salesforce has it for 6.7% of
-- patients while this database has it for 29.2% - an overwrite would erase
-- thousands of real birth dates". That premise was wrong. Salesforce holds a
-- date of birth for 13,188 of these patients, not 1,800, and what this database
-- held in their place was not a real birth date but a mangled one. The rule
-- written to protect the data was the rule keeping it wrong.
--
-- So Salesforce wins on date of birth now. Gender and email stay fill-only:
-- staff type those here, nobody asked for them, and the same argument does not
-- apply to a column this app is the better source for.
--
-- A null from Salesforce still cannot blank a date here - COALESCE the other
-- way round - so a patient Salesforce knows nothing about keeps whatever the
-- clinic has.
--
-- Applied to the live database on 7 October, then run across every patient.
-- 7,575 corrected; a second full pass over all 27,063 changed nothing, which is
-- what convergence looks like. Every previous value is in
-- patient_dob_backup_20261007, and every single change is in
-- patient_dob_corrections with its before and after, so any one of them can be
-- read back or reversed.

-- 1. What each one said before ------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_dob_backup_20261007 (
  id uuid,
  sf_id text,
  first_name text,
  last_name text,
  phone text,
  date_of_birth date,
  captured_at timestamptz
);
ALTER TABLE public.patient_dob_backup_20261007 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.patient_dob_corrections (
  patient_id uuid NOT NULL,
  sf_id text,
  was date,
  now date,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, corrected_at)
);
ALTER TABLE public.patient_dob_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_dob_corrections FROM anon, authenticated;

COMMENT ON TABLE public.patient_dob_corrections IS
  'Every date of birth this app has changed to match Salesforce, with what it '
  'said before. A bulk correction to a clinical field has to be readable back '
  'one patient at a time, not just trusted.';

-- 2. Salesforce is the source of truth for a date of birth --------------------

CREATE OR REPLACE FUNCTION public.sf_set_patient_demographics_bulk(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_updated integer := 0;
BEGIN
  WITH batch AS (
    SELECT DISTINCT ON (x.sf_id) x.sf_id,
           CASE WHEN btrim(COALESCE(x.gender,'')) IN ('Male','Female','Other','Prefer not to say')
                THEN btrim(x.gender) END AS gender,
           NULLIF(btrim(COALESCE(x.email,'')),'') AS email,
           x.date_of_birth
      FROM jsonb_to_recordset(payload) AS x(sf_id text, gender text, email text, date_of_birth date)
     WHERE x.sf_id IS NOT NULL
  ), logged AS (
    -- Written before the update, so the row still holds what it is about to stop
    -- saying.
    INSERT INTO public.patient_dob_corrections (patient_id, sf_id, was, now)
    SELECT p.id, p.sf_id, p.date_of_birth, b.date_of_birth
      FROM public.patients p JOIN batch b ON p.sf_id = b.sf_id
     WHERE b.date_of_birth IS NOT NULL
       AND p.date_of_birth IS DISTINCT FROM b.date_of_birth
    ON CONFLICT DO NOTHING
    RETURNING 1
  ), upd AS (
    UPDATE public.patients p
       SET gender        = COALESCE(NULLIF(btrim(COALESCE(p.gender,'')),''), b.gender),
           email         = COALESCE(NULLIF(btrim(COALESCE(p.email,'')),''), b.email),
           -- Salesforce first, but a null from Salesforce never blanks ours.
           date_of_birth = COALESCE(b.date_of_birth, p.date_of_birth)
      FROM batch b
     WHERE p.sf_id = b.sf_id
       AND ( (NULLIF(btrim(COALESCE(p.gender,'')),'') IS NULL AND b.gender IS NOT NULL)
          OR (NULLIF(btrim(COALESCE(p.email,'')),'')  IS NULL AND b.email  IS NOT NULL)
          OR (b.date_of_birth IS NOT NULL AND p.date_of_birth IS DISTINCT FROM b.date_of_birth) )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END; $function$;

-- 3. And check them all, not the last five hundred ----------------------------
--
-- The nightly job started from sf_tail_cursor(500) - the 500th patient from the
-- end by Salesforce id - so it only ever re-read the newest few hundred. Right
-- for picking up new arrivals, useless for noticing that 7,575 older records
-- disagreed. A full pass scans 27,063 patients in one invocation, inside the
-- function's own 100-second deadline, so there is no reason to look at less.

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'sf-demographics'),
  command := $cmd$ SELECT public.sf_fire_function('sf-import-demographics?pages=20&cursor='); $cmd$
);
