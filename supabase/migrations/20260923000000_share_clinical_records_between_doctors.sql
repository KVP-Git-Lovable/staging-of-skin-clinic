-- Let any doctor read a patient's clinical record. Keep billing to their own.
--
-- 20260910000000 and 20260917040000 narrowed a doctor on data_scope = 'own' to
-- the patients they had treated, across every clinical table. The clinic has now
-- said that is wrong for how they actually work: doctors cover for each other on
-- emergency leave, and a covering doctor needs the appointments, prescriptions,
-- photos, attachments, surveys and notes of a patient they have never seen. A
-- chart that reads "Appts (0), Prescriptions (0), Photos (0)" on a real patient
-- is worse than unhelpful in a consultation - it looks like the patient has no
-- history at all.
--
-- What stays scoped is BILLING. invoices keeps its restrictive policies, so one
-- doctor still cannot read another's takings - which, with phone and e-mail
-- masked on the patient page, is the whole of what the clinic asked to withhold.
--
-- These were RESTRICTIVE policies, so each was AND-ed with the permissive
-- "authenticated staff can read" policy and did the narrowing on its own.
-- Dropping them returns these tables to the permissive policy that was always
-- there; nothing is widened beyond authenticated clinic staff.
--
-- trash_items keeps its scoping: that is "your own deleted items", a different
-- idea from a patient's clinical record. The retired therapy_notes table is left
-- alone.

BEGIN;

DROP POLICY IF EXISTS "scope appointments to own"              ON public.appointments;
DROP POLICY IF EXISTS "scope appointments to own upd"          ON public.appointments;
DROP POLICY IF EXISTS "scope appointments to own del"          ON public.appointments;

DROP POLICY IF EXISTS "scope procedures to own"                ON public.procedures;
DROP POLICY IF EXISTS "scope procedures to own upd"            ON public.procedures;
DROP POLICY IF EXISTS "scope procedures to own del"            ON public.procedures;

DROP POLICY IF EXISTS "scope prescriptions to own"             ON public.prescriptions;
DROP POLICY IF EXISTS "scope prescriptions to own upd"         ON public.prescriptions;
DROP POLICY IF EXISTS "scope prescriptions to own del"         ON public.prescriptions;

DROP POLICY IF EXISTS "scope patient_photos to own"            ON public.patient_photos;
DROP POLICY IF EXISTS "scope patient_photos to own upd"        ON public.patient_photos;
DROP POLICY IF EXISTS "scope patient_photos to own del"        ON public.patient_photos;

DROP POLICY IF EXISTS "scope procedure_attachments to own"     ON public.procedure_attachments;
DROP POLICY IF EXISTS "scope procedure_attachments to own upd" ON public.procedure_attachments;
DROP POLICY IF EXISTS "scope procedure_attachments to own del" ON public.procedure_attachments;

DROP POLICY IF EXISTS "scope procedure_services to own"        ON public.procedure_services;
DROP POLICY IF EXISTS "scope procedure_services to own upd"    ON public.procedure_services;
DROP POLICY IF EXISTS "scope procedure_services to own del"    ON public.procedure_services;

DROP POLICY IF EXISTS "scope appointment_sticky_notes to own"      ON public.appointment_sticky_notes;
DROP POLICY IF EXISTS "scope appointment_sticky_notes to own upd"  ON public.appointment_sticky_notes;
DROP POLICY IF EXISTS "scope appointment_sticky_notes to own del"  ON public.appointment_sticky_notes;

DROP POLICY IF EXISTS "scope procedure_sticky_notes to own"        ON public.procedure_sticky_notes;
DROP POLICY IF EXISTS "scope procedure_sticky_notes to own upd"    ON public.procedure_sticky_notes;
DROP POLICY IF EXISTS "scope procedure_sticky_notes to own del"    ON public.procedure_sticky_notes;

DROP POLICY IF EXISTS "scope survey_responses to own"          ON public.survey_responses;
DROP POLICY IF EXISTS "scope survey_responses to own upd"      ON public.survey_responses;
DROP POLICY IF EXISTS "scope survey_responses to own del"      ON public.survey_responses;

DROP POLICY IF EXISTS "scope patient_feedback to own"          ON public.patient_feedback;
DROP POLICY IF EXISTS "scope patient_feedback to own upd"      ON public.patient_feedback;
DROP POLICY IF EXISTS "scope patient_feedback to own del"      ON public.patient_feedback;

-- invoices deliberately untouched: "scope invoices to own" (+ upd/del) remain.

COMMIT;
