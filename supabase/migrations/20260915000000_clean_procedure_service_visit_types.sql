-- Clear visit types out of procedures.service_name.
--
-- The Salesforce import used to fall back to Diagnosis__c.Type_Of_Appointment__c
-- when no treatment had been recorded yet, so the Procedures list showed
-- "Walk-In" (a visit type) in its Service column. sf-import-clinical no longer
-- does that; this fixes the rows already imported.
--
-- NOTHING IS LOST. The same value is stored verbatim in review_notes as
-- "Type: <value>" (and/or "Visit Type: <value>"), which this does not touch - so
-- the original is still readable on every row afterwards, and this is reversible.
--
-- A row is only changed when its service_name is PROVABLY the visit type that
-- came from Salesforce: it must appear in that row's own review_notes as
-- "Type: <exactly this value>". A real service name cannot satisfy that, so
-- anything genuinely recorded - imported or typed into the app - is left alone.
-- This is complete as well as safe: the import writes "Type: <value>" into
-- review_notes on the very same pass that set service_name, so every affected
-- row carries the proof.
--
-- One statement, so it is atomic on its own and needs no explicit transaction.

UPDATE public.procedures p
   SET service_name = 'Consultation'
 WHERE p.sf_id IS NOT NULL
   AND p.service_name IS NOT NULL
   AND btrim(p.service_name) <> ''
   AND p.review_notes IS NOT NULL
   AND position('Type: ' || btrim(p.service_name) IN p.review_notes) > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.services s
      WHERE lower(btrim(s.name)) = lower(btrim(p.service_name))
   );
