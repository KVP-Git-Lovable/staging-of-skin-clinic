-- Reason for Consultation moves from the appointment to the patient.
--
-- It describes why someone attends the clinic at all (Aesthetic / Clinical, and
-- which concerns), which is a property of the patient rather than of one visit.
-- The appointment form gets a free-text Investigation box instead, bound to the
-- existing appointments.reason_for_consultation column.
--
-- appointments.consultation_type / consultation_reasons are deliberately LEFT IN
-- PLACE. They are the historical record of what was recorded per visit, and
-- nothing else needs to be destroyed to add the new home.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS consultation_type text,
  ADD COLUMN IF NOT EXISTS consultation_reasons text[];

COMMENT ON COLUMN public.patients.consultation_type IS
  'None | Aesthetic | Clinical | Aesthetic & Clinical. Why this patient attends.';
COMMENT ON COLUMN public.patients.consultation_reasons IS
  'Selected concerns; an "Others (Aesthetic|Clinical): <text>" entry carries free text.';

-- Seed each patient from their most recent appointment that recorded one, so the
-- new field is not blank for everyone who already exists.
--
-- Only fills patients that have nothing yet, which makes this safe to re-run and
-- means it can never overwrite something typed into the new field later.
UPDATE public.patients p
   SET consultation_type = latest.consultation_type,
       consultation_reasons = latest.consultation_reasons
  FROM (
    SELECT DISTINCT ON (a.patient_id)
           a.patient_id,
           a.consultation_type,
           a.consultation_reasons
      FROM public.appointments a
     WHERE a.patient_id IS NOT NULL
       AND (
         (a.consultation_type IS NOT NULL AND btrim(a.consultation_type) <> '')
         OR (a.consultation_reasons IS NOT NULL AND array_length(a.consultation_reasons, 1) > 0)
       )
     ORDER BY a.patient_id, a.start_time DESC
  ) AS latest
 WHERE p.id = latest.patient_id
   AND p.consultation_type IS NULL
   AND p.consultation_reasons IS NULL;
