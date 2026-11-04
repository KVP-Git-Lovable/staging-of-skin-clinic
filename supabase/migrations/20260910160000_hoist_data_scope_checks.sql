-- Make the row-scope policies evaluate the scope once per query, not once per row.
--
-- 20260910000000 wrote its predicates with bare calls:
--
--   USING (public.has_full_data_scope() OR staff_id = public.current_staff_id())
--
-- Both are SECURITY DEFINER functions that each run their own query against staff /
-- user_roles_config. Called bare inside a policy, Postgres evaluates them once per
-- row. Wrapping a call in a scalar subquery - (SELECT public.has_full_data_scope()) -
-- lets the planner hoist it into an InitPlan evaluated once per statement.
--
-- Measured on Postgres 16 over 50,000 procedures, as a scoped doctor:
--   bare calls          874 ms
--   scalar subqueries     7 ms
-- with identical row counts either way. EXPLAIN confirms four InitPlans and a filter
-- of plain constant comparisons.
--
-- This is a planner change only. Every predicate keeps its exact meaning, so who can
-- see what does not move.

BEGIN;

-- Appointments -----------------------------------------------------------------

DROP POLICY IF EXISTS "scope appointments to own" ON public.appointments;
CREATE POLICY "scope appointments to own" ON public.appointments
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_full_data_scope()) OR staff_id = (SELECT public.current_staff_id()));

DROP POLICY IF EXISTS "scope appointments to own upd" ON public.appointments;
CREATE POLICY "scope appointments to own upd" ON public.appointments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.has_full_data_scope()) OR staff_id = (SELECT public.current_staff_id()))
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope appointments to own del" ON public.appointments;
CREATE POLICY "scope appointments to own del" ON public.appointments
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING ((SELECT public.has_full_data_scope()) OR staff_id = (SELECT public.current_staff_id()));

-- Procedures -------------------------------------------------------------------

DROP POLICY IF EXISTS "scope procedures to own" ON public.procedures;
CREATE POLICY "scope procedures to own" ON public.procedures
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR staff_id = (SELECT public.current_staff_id())
    OR assisted_by = (SELECT public.current_staff_id())
    OR (SELECT public.current_staff_id()) = ANY (assisted_by_ids)
  );

DROP POLICY IF EXISTS "scope procedures to own upd" ON public.procedures;
CREATE POLICY "scope procedures to own upd" ON public.procedures
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR staff_id = (SELECT public.current_staff_id())
    OR assisted_by = (SELECT public.current_staff_id())
    OR (SELECT public.current_staff_id()) = ANY (assisted_by_ids)
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope procedures to own del" ON public.procedures;
CREATE POLICY "scope procedures to own del" ON public.procedures
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR staff_id = (SELECT public.current_staff_id())
    OR assisted_by = (SELECT public.current_staff_id())
    OR (SELECT public.current_staff_id()) = ANY (assisted_by_ids)
  );

-- Invoices ---------------------------------------------------------------------

DROP POLICY IF EXISTS "scope invoices to own" ON public.invoices;
CREATE POLICY "scope invoices to own" ON public.invoices
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR doctor_id = (SELECT public.current_staff_id())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  );

DROP POLICY IF EXISTS "scope invoices to own upd" ON public.invoices;
CREATE POLICY "scope invoices to own upd" ON public.invoices
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR doctor_id = (SELECT public.current_staff_id())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope invoices to own del" ON public.invoices;
CREATE POLICY "scope invoices to own del" ON public.invoices
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR doctor_id = (SELECT public.current_staff_id())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  );

-- Clinical children of a procedure ---------------------------------------------
-- can_see_procedure() takes an argument, so it is inherently per row - but it sits
-- behind the hoisted scope check, so it never runs for an unrestricted user, and for
-- a scoped one only over rows the parent already narrowed.

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
      'USING ((SELECT public.has_full_data_scope()) OR procedure_id IS NULL OR public.can_see_procedure(procedure_id))',
      'scope ' || t || ' to own', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own upd', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING ((SELECT public.has_full_data_scope()) OR procedure_id IS NULL OR public.can_see_procedure(procedure_id)) '
      'WITH CHECK (true)',
      'scope ' || t || ' to own upd', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'scope ' || t || ' to own del', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
      'USING ((SELECT public.has_full_data_scope()) OR procedure_id IS NULL OR public.can_see_procedure(procedure_id))',
      'scope ' || t || ' to own del', t
    );
  END LOOP;
END $$;

COMMIT;
