-- The Details tab reads "Source: salesforce" on 9,866 patients, and it still
-- read it after this morning's fix went to main. That fix is in two edge
-- functions, and an edge function only starts running when it is deployed to
-- Supabase - which a git push does not do. Lovable had the commit within the
-- minute; a dry run against the live function half an hour later still came back
-- without the new fields. The project's own .lovable-sync notes record the same
-- thing happening twice before.
--
-- So this is the half that does not need a deploy. The rule is the clinic's:
-- where Salesforce has no source, this app shows no source.
--
-- "salesforce" is never a value Salesforce holds. It is the word
-- sf-import-clinical writes on a patient it creates (index.ts:322). So every one
-- of the 9,866 is a patient whose real source is unknown here, and unknown reads
-- blank - not a word that looks like an answer. A blank is a visible gap
-- somebody can fill; it is also what makes it obvious, once the deploy happens,
-- which patients Salesforce could actually name a source for.
--
-- Nothing else is touched. 9,603 "Walk-in", 4,322 "Social media" and the
-- Reference buckets are what the clinic has been reading and reporting on for
-- months, and none of them is in question.
--
-- Reversible in one statement from patient_source_backup_20261007, which holds
-- all 27,282 values as they stood this morning:
--
--   UPDATE public.patients p SET source = b.source
--     FROM public.patient_source_backup_20261007 b WHERE b.id = p.id;

-- 1. Every one of them, before it goes ----------------------------------------

INSERT INTO public.patient_source_corrections (patient_id, sf_id, was, now)
SELECT p.id, p.sf_id, p.source, NULL
  FROM public.patients p
 WHERE lower(btrim(coalesce(p.source, ''))) = 'salesforce'
ON CONFLICT DO NOTHING;

UPDATE public.patients
   SET source = NULL
 WHERE lower(btrim(coalesce(source, ''))) = 'salesforce';

-- 2. And it does not come back ------------------------------------------------
--
-- The deployed sf-import-clinical still writes the word on every patient it
-- creates, and sf-clinical-catchup runs every five minutes. The repo already
-- writes null instead, but that is waiting on the same deploy, so without a
-- guard here the word returns with the next new Salesforce patient.
--
-- A trigger of its own rather than another edit to stamp_record_owner: that one
-- guards four tables and three migrations have already fought over it. This one
-- does a string comparison on INSERT and nothing else.
--
-- It costs nothing after the deploy - the new code sends null anyway, and then
-- this never matches again. It is deliberately narrow: only the exact word, only
-- on INSERT, so a receptionist choosing a source in the app is never affected.

CREATE OR REPLACE FUNCTION public.drop_import_source_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF lower(btrim(coalesce(NEW.source, ''))) = 'salesforce' THEN
    NEW.source := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.drop_import_source_stamp() IS
  'Keeps the importer''s own name out of the patient Source column. Where a '
  'record came from is recorded by sf_id; Source is where the patient came from.';

DROP TRIGGER IF EXISTS patients_drop_import_source_stamp ON public.patients;
CREATE TRIGGER patients_drop_import_source_stamp
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.drop_import_source_stamp();
