-- Limit a doctor's clinical records to their own patients.
--
-- 20260910000000 scoped appointments, procedures and invoices to the staff
-- member who owns them. It did not scope the records that hang off a PATIENT
-- rather than off an appointment - photos, therapy notes, survey responses and
-- feedback - so a doctor on data_scope = 'own' sees their own appointments and
-- their own billing, but every photo in the clinic.
--
-- Patients themselves stay visible to everyone, exactly as before: the name,
-- phone and chart of every patient is deliberately shared (see the comment on
-- user_roles_config.data_scope). What narrows here is only the clinical record
-- attached to a patient the doctor has not treated.
--
-- "Their own patient" means one they have an appointment with, or a procedure
-- they performed or assisted on. A record is also visible when it hangs off one
-- of their own appointments, which covers a note taken before the patient link
-- was filled in.
--
-- Additive and fail-open, like the migration it extends: has_full_data_scope()
-- returns true for anyone without a staff row or without a role, so only roles
-- deliberately set to 'own' are narrowed and everyone else is untouched.

-- 1. The helper ---------------------------------------------------------------

-- SECURITY DEFINER so the lookup inside is not itself filtered by the policies
-- being defined, which would make it circular. Same pattern as
-- can_see_procedure() in 20260910000000.
CREATE OR REPLACE FUNCTION public.is_my_patient(_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_full_data_scope()
      OR (
        _patient_id IS NOT NULL
        AND public.current_staff_id() IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.appointments a
             WHERE a.patient_id = _patient_id
               AND a.staff_id = public.current_staff_id()
          )
          OR EXISTS (
            SELECT 1 FROM public.procedures p
             WHERE p.patient_id = _patient_id
               AND (
                     p.staff_id = public.current_staff_id()
                  OR p.assisted_by = public.current_staff_id()
                  OR public.current_staff_id() = ANY (p.assisted_by_ids)
                  )
          )
        )
      );
$$;

COMMENT ON FUNCTION public.is_my_patient(uuid) IS
  'True when the caller has full data scope, or has treated this patient (an appointment of theirs, or a procedure they performed or assisted on).';

-- Not callable anonymously, matching the hardening applied to the other
-- SECURITY DEFINER helpers in this schema.
REVOKE ALL ON FUNCTION public.is_my_patient(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_my_patient(uuid) TO authenticated, service_role;

-- 2. The policies -------------------------------------------------------------
--
-- RESTRICTIVE, so they AND with the existing permissive "Authenticated staff
-- can read X" policies rather than replacing them. INSERT is deliberately left
-- unscoped, as in 20260910000000: a doctor may well record something for a
-- patient the front desk has not yet booked to them.
--
-- has_full_data_scope() is called as a scalar subquery so the planner evaluates
-- it once per statement rather than once per row (see 20260910160000).
-- is_my_patient() takes a column, so it cannot be hoisted the same way.

DO $$
DECLARE
  t text;
  patient_col text;
  appt_clause text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'patient_photos',
    'therapy_notes',
    'survey_responses',
    'patient_feedback'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    -- Every one of these carries patient_id; therapy_notes allows it to be
    -- null, which is what the appointment clause is for.
    SELECT column_name INTO patient_col
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = t AND column_name = 'patient_id';
    IF patient_col IS NULL THEN
      CONTINUE;
    END IF;

    appt_clause := '';
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'appointment_id'
    ) THEN
      appt_clause :=
        ' OR appointment_id IN (SELECT a.id FROM public.appointments a'
        || ' WHERE a.staff_id = (SELECT public.current_staff_id()))';
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated '
      || 'USING ((SELECT public.has_full_data_scope()) OR public.is_my_patient(patient_id)%s)',
      'scope ' || t || ' to own', t, appt_clause);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own upd', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      || 'USING ((SELECT public.has_full_data_scope()) OR public.is_my_patient(patient_id)%s) '
      || 'WITH CHECK (true)',
      'scope ' || t || ' to own upd', t, appt_clause);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own del', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      || 'USING ((SELECT public.has_full_data_scope()) OR public.is_my_patient(patient_id)%s)',
      'scope ' || t || ' to own del', t, appt_clause);
  END LOOP;
END $$;

-- 3. Indexes the policies lean on ---------------------------------------------
-- is_my_patient() probes appointments and procedures by (patient_id, staff_id)
-- on every row of a photo/note/response list.

CREATE INDEX IF NOT EXISTS appointments_patient_staff_idx
  ON public.appointments (patient_id, staff_id);
CREATE INDEX IF NOT EXISTS procedures_patient_staff_idx
  ON public.procedures (patient_id, staff_id);
