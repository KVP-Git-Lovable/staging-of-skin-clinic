-- Freeform notes on an appointment, so a therapist can record what happened
-- during the visit.
--
-- A deliberate copy of procedure_sticky_notes (20260902120000) rather than a
-- reuse of it: that table's procedure_id is NOT NULL against procedures, and an
-- appointment is not a procedure - many appointments never have one. The two
-- tables share a shape and one UI component, not a row.

CREATE TABLE IF NOT EXISTS public.appointment_sticky_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  title text,
  content text NOT NULL DEFAULT '',
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_sticky_notes IS
  'Freeform notes about a visit, written against the appointment. Mirrors procedure_sticky_notes.';

CREATE INDEX IF NOT EXISTS appointment_sticky_notes_appointment_updated_idx
  ON public.appointment_sticky_notes (appointment_id, updated_at DESC);

ALTER TABLE public.appointment_sticky_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth manage appointment_sticky_notes" ON public.appointment_sticky_notes;
CREATE POLICY "auth manage appointment_sticky_notes" ON public.appointment_sticky_notes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- A note is only as visible as the appointment it belongs to. Without this,
-- someone restricted to their own appointments would still read every note in
-- the clinic - the permissive policy above says nothing about scope.
--
-- Written here rather than left to 20260910160000_hoist_data_scope_checks.sql,
-- which loops over a fixed list of table names that does not include this one.
DROP POLICY IF EXISTS "scope appointment_sticky_notes to own" ON public.appointment_sticky_notes;
CREATE POLICY "scope appointment_sticky_notes to own" ON public.appointment_sticky_notes
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  );

DROP POLICY IF EXISTS "scope appointment_sticky_notes to own upd" ON public.appointment_sticky_notes;
CREATE POLICY "scope appointment_sticky_notes to own upd" ON public.appointment_sticky_notes
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "scope appointment_sticky_notes to own del" ON public.appointment_sticky_notes;
CREATE POLICY "scope appointment_sticky_notes to own del" ON public.appointment_sticky_notes
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.has_full_data_scope())
    OR appointment_id IN (
         SELECT a.id FROM public.appointments a WHERE a.staff_id = (SELECT public.current_staff_id())
       )
  );

-- The same generic audit-stamp trigger the rest of the schema uses. On insert it
-- fills created_by/updated_by from auth.uid() when the client omits them (which
-- the notes card does); on update it forces created_by back to its old value and
-- updated_by to auth.uid(), so authorship cannot be rewritten after the fact.
-- Note it is COALESCE on insert, not an override - a client that sends its own
-- created_by keeps it. That matches every other table here, and is worth knowing
-- before treating the field as proof of who wrote a note.
DROP TRIGGER IF EXISTS stamp_audit_user ON public.appointment_sticky_notes;
CREATE TRIGGER stamp_audit_user BEFORE INSERT OR UPDATE ON public.appointment_sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.stamp_audit_user();

DROP TRIGGER IF EXISTS appointment_sticky_notes_updated_at ON public.appointment_sticky_notes;
CREATE TRIGGER appointment_sticky_notes_updated_at BEFORE UPDATE ON public.appointment_sticky_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
