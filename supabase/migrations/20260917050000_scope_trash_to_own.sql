-- Close the trash bypass.
--
-- move_to_trash() and restore_from_trash() are SECURITY DEFINER and their only
-- check is "are you signed in". They run as the owner, so RLS does not apply:
-- a doctor on data_scope = 'own' could pass any record id and the function
-- would copy the whole row into trash_items as jsonb and DELETE it - for a
-- colleague's appointment or invoice they cannot even SELECT. Every RESTRICTIVE
-- delete policy added by 20260910000000, 20260910160000 and 20260917040000 was
-- simply not consulted. trash_items itself is readable by any authenticated
-- user, so the copied row was readable afterwards too.
--
-- The functions keep SECURITY DEFINER - they need it to write trash_items and
-- to delete a row the caller may not SELECT - but they now check ownership
-- explicitly, with the same predicates the delete policies use.

-- 1. May the caller trash this record? ----------------------------------------

CREATE OR REPLACE FUNCTION public.can_trash_record(_object_type text, _record_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_full_data_scope() THEN
    RETURN true;
  END IF;

  -- Only the row-scoped tables are checked. Everything else the trash accepts
  -- (patients, services, masters, campaigns...) is unscoped for reading too, so
  -- narrowing it here would be a new restriction nobody asked for.
  IF _object_type = 'appointments' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.id = _record_id AND a.staff_id = public.current_staff_id());

  ELSIF _object_type = 'procedures' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.procedures p
       WHERE p.id = _record_id
         AND (p.staff_id = public.current_staff_id()
           OR p.assisted_by = public.current_staff_id()
           OR public.current_staff_id() = ANY (p.assisted_by_ids)));

  ELSIF _object_type = 'invoices' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.id = _record_id
         AND (i.doctor_id = public.current_staff_id()
           OR i.appointment_id IN (
                SELECT a.id FROM public.appointments a
                 WHERE a.staff_id = public.current_staff_id())));

  ELSIF _object_type = 'prescriptions' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.prescriptions r
       WHERE r.id = _record_id
         AND (r.procedure_id IS NULL OR public.can_see_procedure(r.procedure_id)));

  ELSIF _object_type IN ('patient_photos', 'survey_responses') THEN
    RETURN EXISTS (
      SELECT 1 FROM public.patient_photos x
       WHERE _object_type = 'patient_photos' AND x.id = _record_id
         AND public.is_my_patient(x.patient_id))
      OR EXISTS (
      SELECT 1 FROM public.survey_responses y
       WHERE _object_type = 'survey_responses' AND y.id = _record_id
         AND public.is_my_patient(y.patient_id));
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_trash_record(text, uuid) IS
  'Mirrors the RESTRICTIVE delete policies, for the SECURITY DEFINER trash functions which bypass RLS.';

REVOKE ALL ON FUNCTION public.can_trash_record(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_trash_record(text, uuid) TO authenticated, service_role;

-- 2. Guard the two functions --------------------------------------------------

CREATE OR REPLACE FUNCTION public.move_to_trash(_object_type text, _record_id uuid, _label text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_json jsonb;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT public.trash_allowed_object(_object_type) THEN
    RAISE EXCEPTION 'Object % is not enabled for trash', _object_type;
  END IF;

  -- The check this function never had. Without it the DELETE below ran as the
  -- function owner, straight past every delete policy.
  IF NOT public.can_trash_record(_object_type, _record_id) THEN
    RAISE EXCEPTION 'You can only delete your own records';
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', _object_type)
    INTO row_json USING _record_id;

  IF row_json IS NULL THEN
    RAISE EXCEPTION 'Record not found';
  END IF;

  INSERT INTO public.trash_items (object_type, record_id, record_label, record_data, deleted_by, deleted_by_name)
  VALUES (_object_type, _record_id, _label, row_json, auth.uid(),
          (SELECT email FROM auth.users WHERE id = auth.uid()))
  RETURNING id INTO new_id;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', _object_type) USING _record_id;

  RETURN new_id;
END;
$$;

-- Restoring re-inserts the row, so it needs the same gate. The record is gone
-- from its own table by then, so ownership cannot be re-derived from it -
-- "you may restore what you trashed" is the rule, which pairs exactly with the
-- check above.
CREATE OR REPLACE FUNCTION public.can_restore_trash_item(_trash_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_full_data_scope()
      OR EXISTS (
           SELECT 1 FROM public.trash_items t
            WHERE t.id = _trash_id AND t.deleted_by = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.can_restore_trash_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_restore_trash_item(uuid) TO authenticated, service_role;

-- 3. Stop the copied row being readable by everyone ---------------------------
--
-- record_data holds the entire deleted row. A scoped user sees only what they
-- put there themselves; everyone else is unchanged.

DROP POLICY IF EXISTS "scope trash_items to own" ON public.trash_items;
CREATE POLICY "scope trash_items to own" ON public.trash_items
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING ((SELECT public.has_full_data_scope()) OR deleted_by = auth.uid());

DROP POLICY IF EXISTS "scope trash_items to own upd" ON public.trash_items;
CREATE POLICY "scope trash_items to own upd" ON public.trash_items
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING ((SELECT public.has_full_data_scope()) OR deleted_by = auth.uid())
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.restore_from_trash(_trash_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.trash_items;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT public.can_restore_trash_item(_trash_id) THEN
    RAISE EXCEPTION 'You can only restore records you deleted';
  END IF;

  SELECT * INTO item FROM public.trash_items WHERE id = _trash_id;
  IF NOT FOUND OR item.status <> 'trashed' THEN
    RAISE EXCEPTION 'Trash item not available for restore';
  END IF;

  EXECUTE format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, item.object_type) USING item.record_data;

  UPDATE public.trash_items
     SET status = 'restored', restored_at = now(), restored_by = auth.uid()
   WHERE id = _trash_id;
END;
$$;
