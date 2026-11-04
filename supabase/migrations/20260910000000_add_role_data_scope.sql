-- Per-role data scope: "all records" vs "only my own".
--
-- Until now role_module_permissions only answered "can this role open the Billing
-- module at all" - there was no notion of WHICH ROWS a role may see, and every core
-- table was `USING (true)` for any authenticated user. This adds that second
-- dimension so a Doctor role can be limited to their own appointments, procedures
-- and invoices while an Admin role keeps the full picture.
--
-- Patients are deliberately NOT scoped: every clinician sees every patient.

-- 1. The scope itself, on the role ------------------------------------------------

ALTER TABLE public.user_roles_config
  ADD COLUMN IF NOT EXISTS data_scope text NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_config_data_scope_check'
  ) THEN
    ALTER TABLE public.user_roles_config
      ADD CONSTRAINT user_roles_config_data_scope_check CHECK (data_scope IN ('all', 'own'));
  END IF;
END $$;

COMMENT ON COLUMN public.user_roles_config.data_scope IS
  'all = every record; own = only records this staff member owns (their appointments, procedures, invoices). Patients are always visible to everyone.';

-- 2. Helpers ----------------------------------------------------------------------
-- SECURITY DEFINER so the policies below can read staff / user_roles_config without
-- being subject to those tables' own RLS (which would recurse).

CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.staff WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

-- True unless the caller's role explicitly says 'own'. Defaulting to true keeps this
-- migration purely additive: anyone without a staff row or without a role behaves
-- exactly as they did before, and only roles deliberately set to 'own' are narrowed.
CREATE OR REPLACE FUNCTION public.has_full_data_scope()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT urc.data_scope IS DISTINCT FROM 'own'
        FROM public.staff s
        LEFT JOIN public.user_roles_config urc ON urc.id = s.role_id
       WHERE s.auth_user_id = auth.uid()
       LIMIT 1
    ),
    true
  );
$$;

-- A procedure is "mine" if I performed it or assisted on it. assisted_by is the
-- legacy single-assistant column, assisted_by_ids the current array.
CREATE OR REPLACE FUNCTION public.can_see_procedure(_procedure_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_full_data_scope()
      OR EXISTS (
           SELECT 1
             FROM public.procedures p
            WHERE p.id = _procedure_id
              AND (
                    p.staff_id = public.current_staff_id()
                 OR p.assisted_by = public.current_staff_id()
                 OR public.current_staff_id() = ANY (p.assisted_by_ids)
              )
         );
$$;

-- 3. Row scoping ------------------------------------------------------------------
-- These are RESTRICTIVE policies, which AND with the existing permissive ones rather
-- than replacing them. That means nothing already granted is disturbed, the change is
-- reversible by dropping these policies alone, and no existing policy has to be
-- renamed or recreated. They target `authenticated` only.
--
-- INSERT is left alone throughout: the point is who can SEE and CHANGE a record, not
-- who may create one (a doctor may well book on a colleague's behalf). UPDATE and
-- DELETE are scoped alongside SELECT, because a row you cannot see is not a row you
-- should be able to edit or remove. UPDATE carries WITH CHECK (true) so that only
-- visibility is enforced, never the value being written.

DROP POLICY IF EXISTS "scope appointments to own" ON public.appointments;
CREATE POLICY "scope appointments to own" ON public.appointments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.has_full_data_scope() OR staff_id = public.current_staff_id());

DROP POLICY IF EXISTS "scope appointments to own upd" ON public.appointments;
CREATE POLICY "scope appointments to own upd" ON public.appointments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.has_full_data_scope() OR staff_id = public.current_staff_id())
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope appointments to own del" ON public.appointments;
CREATE POLICY "scope appointments to own del" ON public.appointments
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.has_full_data_scope() OR staff_id = public.current_staff_id());

DROP POLICY IF EXISTS "scope procedures to own" ON public.procedures;
CREATE POLICY "scope procedures to own" ON public.procedures
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_full_data_scope()
    OR staff_id = public.current_staff_id()
    OR assisted_by = public.current_staff_id()
    OR public.current_staff_id() = ANY (assisted_by_ids)
  );

DROP POLICY IF EXISTS "scope procedures to own upd" ON public.procedures;
CREATE POLICY "scope procedures to own upd" ON public.procedures
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.has_full_data_scope()
    OR staff_id = public.current_staff_id()
    OR assisted_by = public.current_staff_id()
    OR public.current_staff_id() = ANY (assisted_by_ids)
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope procedures to own del" ON public.procedures;
CREATE POLICY "scope procedures to own del" ON public.procedures
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.has_full_data_scope()
    OR staff_id = public.current_staff_id()
    OR assisted_by = public.current_staff_id()
    OR public.current_staff_id() = ANY (assisted_by_ids)
  );

-- Invoices carry doctor_id, but it is nullable and older rows may not have it set -
-- so an invoice also counts as mine when it hangs off one of my appointments.
DROP POLICY IF EXISTS "scope invoices to own" ON public.invoices;
CREATE POLICY "scope invoices to own" ON public.invoices
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.has_full_data_scope()
    OR doctor_id = public.current_staff_id()
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = public.current_staff_id()
       )
  );

DROP POLICY IF EXISTS "scope invoices to own upd" ON public.invoices;
CREATE POLICY "scope invoices to own upd" ON public.invoices
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.has_full_data_scope()
    OR doctor_id = public.current_staff_id()
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = public.current_staff_id()
       )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope invoices to own del" ON public.invoices;
CREATE POLICY "scope invoices to own del" ON public.invoices
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    public.has_full_data_scope()
    OR doctor_id = public.current_staff_id()
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = public.current_staff_id()
       )
  );

-- 4. Clinical children of a procedure ---------------------------------------------
-- Otherwise the parent row is hidden while its prescriptions, service lines and notes
-- stay readable. A NULL procedure_id means the row isn't tied to a procedure, so it
-- keeps its current visibility.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prescriptions',
    'procedure_services',
    'procedure_sticky_notes',
    'procedure_attachments'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated '
      'USING (public.has_full_data_scope() OR procedure_id IS NULL OR public.can_see_procedure(procedure_id))',
      'scope ' || t || ' to own', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own upd', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (public.has_full_data_scope() OR procedure_id IS NULL OR public.can_see_procedure(procedure_id)) '
      'WITH CHECK (true)',
      'scope ' || t || ' to own upd', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own del', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING (public.has_full_data_scope() OR procedure_id IS NULL OR public.can_see_procedure(procedure_id))',
      'scope ' || t || ' to own del', t
    );
  END LOOP;
END $$;

-- 5. Supporting indexes -----------------------------------------------------------
-- Every scoped read now filters on these columns.

CREATE INDEX IF NOT EXISTS appointments_staff_id_idx ON public.appointments (staff_id);
CREATE INDEX IF NOT EXISTS procedures_staff_id_idx ON public.procedures (staff_id);
CREATE INDEX IF NOT EXISTS procedures_assisted_by_ids_idx ON public.procedures USING gin (assisted_by_ids);
CREATE INDEX IF NOT EXISTS invoices_doctor_id_idx ON public.invoices (doctor_id);
CREATE INDEX IF NOT EXISTS staff_auth_user_id_idx ON public.staff (auth_user_id);

-- 6. Apply the intended setup -----------------------------------------------------
-- Doctors see their own work; every other role (Admin included) keeps full visibility.

UPDATE public.user_roles_config
   SET data_scope = 'own'
 WHERE lower(name) = 'doctor';
