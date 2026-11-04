-- Give the patients list a registration date that means something.
--
-- patients.created_at records when a row was loaded into this app, not when the
-- person became a patient. Because the history arrived in bulk, 17,242 patients
-- carry 2026-04-23, another 5,717 carry 2026-09-18 and 3,638 carry 2026-09-19 -
-- 98% of the list. Sorting newest-first therefore parks the most recent import
-- (the cohort with nothing but a name and a phone number) permanently at the top,
-- and the "Created Date" column tells the clinic nothing true.
--
-- Salesforce holds the real date on Patient__c.CreatedDate.
--
-- created_at is deliberately NOT rewritten. It is honest about what it actually
-- means, other things order by it, and overwriting an audit field on 26,597 rows
-- to fix a display problem is not a trade worth making.

-- Raw value from Salesforce. Null for patients created in this app, who have no
-- Salesforce record and whose created_at is already the truth.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS sf_registered_at timestamptz;

COMMENT ON COLUMN public.patients.sf_registered_at IS
  'Patient__c.CreatedDate from Salesforce. Null for patients created in this app.';

-- What the UI reads and orders by. Generated, so it is never null and needs no
-- backfill of its own: every patient has a usable date from the moment this runs,
-- and each one becomes truthful as the Salesforce value lands beside it.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS registered_at timestamptz
  GENERATED ALWAYS AS (COALESCE(sf_registered_at, created_at)) STORED;

COMMENT ON COLUMN public.patients.registered_at IS
  'When the patient registered: the Salesforce date where we have it, else when the row was created here.';

CREATE INDEX IF NOT EXISTS patients_registered_at_desc_idx
  ON public.patients (registered_at DESC);

-- Sets sf_registered_at for a batch of Salesforce patients in one statement.
-- Input: jsonb array of {sf_id, registered_at}.
--
-- Writes that one column and nothing else, and only onto rows whose sf_id already
-- matches, so it can neither create, delete nor otherwise alter a patient. Rows
-- already holding the value are skipped, which makes a re-run a no-op rather than
-- 27,000 pointless writes.
CREATE OR REPLACE FUNCTION public.sf_set_patient_registered_bulk(payload jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH batch AS (
    SELECT DISTINCT ON (x.sf_id) x.sf_id, x.registered_at
      FROM jsonb_to_recordset(payload) AS x(sf_id text, registered_at timestamptz)
     WHERE x.sf_id IS NOT NULL
       AND x.registered_at IS NOT NULL
  ), upd AS (
    UPDATE public.patients p
       SET sf_registered_at = b.registered_at
      FROM batch b
     WHERE p.sf_id = b.sf_id
       AND p.sf_registered_at IS DISTINCT FROM b.registered_at
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM upd;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.sf_set_patient_registered_bulk(jsonb) FROM PUBLIC, anon, authenticated;
