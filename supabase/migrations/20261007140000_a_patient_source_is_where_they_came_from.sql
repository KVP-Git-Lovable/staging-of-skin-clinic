-- 9,866 patients have "salesforce" in their Source column. That is not a source.
--
-- It is the literal word sf-import-clinical stamps on a patient it creates the
-- first time a sync meets one it has not seen - every one of them created
-- between 9 and 24 September, every one with an sf_id. The column is read as
-- fact: it shows on the patient's Details tab, and it is what the source
-- breakdown in reports groups by. So the single largest "source" in this clinic
-- is a word describing where the row came from, not where the patient did.
--
-- Salesforce has the real answer in Patient_source__c, and nothing has ever
-- asked for it: sf-import-demographics fetched Id, Sex__c, Email_ID__c and
-- Date_of_birth__c and no more, which is why no sync has ever corrected these.
-- It fetches Patient_source__c as of today, and sf-import-clinical now writes
-- null instead of the word. Both are edge functions, so they reach the clinic on
-- the next deploy; this half is the database waiting for them, and it does
-- nothing at all until the field starts arriving.
--
-- Salesforce wins over a blank and over the stamped word. It does NOT overwrite
-- a source somebody chose in this app - and that is a deliberate narrowing of
-- what I proposed. The date-of-birth correction this morning could overwrite
-- freely because the values here were provably mangled by the migration. These
-- are not: 9,603 "Walk-in", 4,322 "Social media" and the Reference buckets are
-- what the clinic has been reading and reporting on for months, and a source is
-- something a receptionist picks here at registration. Replacing 14,000 of those
-- on no evidence they are wrong is a change nobody asked for. Widening it to a
-- full overwrite is one statement if that turns out to be wanted.
--
-- Every value is captured first in patient_source_backup_20261007, and every
-- change is recorded with its before and after in patient_source_corrections.

-- 1. What each one said before -------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_source_backup_20261007 (
  id uuid,
  sf_id text,
  first_name text,
  last_name text,
  phone text,
  source text,
  captured_at timestamptz
);
ALTER TABLE public.patient_source_backup_20261007 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.patient_source_backup_20261007 (id, sf_id, first_name, last_name, phone, source, captured_at)
SELECT p.id, p.sf_id, p.first_name, p.last_name, p.phone, p.source, now()
  FROM public.patients p
 WHERE NOT EXISTS (SELECT 1 FROM public.patient_source_backup_20261007 b WHERE b.id = p.id);

CREATE TABLE IF NOT EXISTS public.patient_source_corrections (
  patient_id uuid NOT NULL,
  sf_id text,
  was text,
  now text,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, corrected_at)
);
ALTER TABLE public.patient_source_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.patient_source_corrections FROM anon, authenticated;

COMMENT ON TABLE public.patient_source_corrections IS
  'Every patient Source this app has changed to match Salesforce, with what it '
  'said before. The same reason as patient_dob_corrections: a bulk change has to '
  'be readable back one patient at a time, not just trusted.';

-- 2. Only a value the column already means something by -----------------------
--
-- The app offers six (src/lib/patientSourceOptions.ts) and the live data carries
-- four older spellings beside them. A Select whose options omit the stored value
-- renders blank - the patient then reads as having no source at all, and saving
-- quietly replaces it - so an import must never introduce a seventh word.
-- normaliseSource in the edge function already guarantees this; the same list
-- here means a hand-written payload cannot get round it either.

CREATE OR REPLACE FUNCTION public.sf_patient_source_or_null(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN btrim(COALESCE(_raw, '')) IN (
    'Walk-in', 'Advertisement', 'Dr. referral', 'Referred by Patient', 'Campaign', 'Other',
    'Social media', 'Reference - other patients', 'Reference - other Dr', 'Other Dr. referral'
  ) THEN btrim(_raw) END;
$$;

-- 3. Apply it ------------------------------------------------------------------
--
-- The payload gains a fifth key. A payload without it - which is what the
-- currently deployed function sends - reads source as NULL throughout and
-- changes nothing, so this is safe to apply before the deploy and does nothing
-- until after it.

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
           x.date_of_birth,
           public.sf_patient_source_or_null(x.source) AS source
      FROM jsonb_to_recordset(payload)
             AS x(sf_id text, gender text, email text, date_of_birth date, source text)
     WHERE x.sf_id IS NOT NULL
  ), targets AS (
    -- One place deciding what each column becomes, so the log below and the
    -- update cannot drift apart.
    SELECT p.id, p.sf_id,
           p.date_of_birth AS dob_was,
           CASE WHEN b.date_of_birth IS NOT NULL THEN b.date_of_birth ELSE p.date_of_birth END AS dob_now,
           p.source AS source_was,
           CASE
             -- A blank, or the stamp sf-import-clinical used to leave. Anything
             -- a person chose in this app stays as they chose it.
             WHEN b.source IS NOT NULL
              AND (NULLIF(btrim(COALESCE(p.source,'')),'') IS NULL
                   OR lower(btrim(p.source)) = 'salesforce')
             THEN b.source
             ELSE p.source
           END AS source_now,
           b.gender, b.email
      FROM public.patients p JOIN batch b ON p.sf_id = b.sf_id
  ), logged_dob AS (
    -- Written before the update, so the row still holds what it is about to stop
    -- saying.
    INSERT INTO public.patient_dob_corrections (patient_id, sf_id, was, now)
    SELECT t.id, t.sf_id, t.dob_was, t.dob_now
      FROM targets t WHERE t.dob_now IS DISTINCT FROM t.dob_was
    ON CONFLICT DO NOTHING
    RETURNING 1
  ), logged_source AS (
    INSERT INTO public.patient_source_corrections (patient_id, sf_id, was, now)
    SELECT t.id, t.sf_id, t.source_was, t.source_now
      FROM targets t WHERE t.source_now IS DISTINCT FROM t.source_was
    ON CONFLICT DO NOTHING
    RETURNING 1
  ), upd AS (
    UPDATE public.patients p
       SET gender        = COALESCE(NULLIF(btrim(COALESCE(p.gender,'')),''), t.gender),
           email         = COALESCE(NULLIF(btrim(COALESCE(p.email,'')),''), t.email),
           -- Salesforce first on these two, but a null from Salesforce never
           -- blanks what is here: both fall back to the stored value above.
           date_of_birth = t.dob_now,
           source        = t.source_now
      FROM targets t
     WHERE p.id = t.id
       AND ( (NULLIF(btrim(COALESCE(p.gender,'')),'') IS NULL AND t.gender IS NOT NULL)
          OR (NULLIF(btrim(COALESCE(p.email,'')),'')  IS NULL AND t.email  IS NOT NULL)
          OR t.dob_now    IS DISTINCT FROM t.dob_was
          OR t.source_now IS DISTINCT FROM t.source_was )
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END; $function$;
