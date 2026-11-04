
ALTER TABLE public.list_views DROP CONSTRAINT IF EXISTS list_views_section_check;
ALTER TABLE public.list_views ADD CONSTRAINT list_views_section_check
  CHECK (section ~ '^[a-z_]+$');

CREATE TABLE IF NOT EXISTS public.trash_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  record_id uuid NOT NULL,
  record_label text,
  record_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'trashed' CHECK (status IN ('trashed','restored','purged')),
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_by uuid,
  restored_at timestamptz,
  purged_by uuid,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trash_items TO authenticated;
GRANT ALL ON public.trash_items TO service_role;
ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view trash" ON public.trash_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert trash" ON public.trash_items
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update trash" ON public.trash_items
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trash_items_updated_at BEFORE UPDATE ON public.trash_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS trash_items_status_idx ON public.trash_items(status, deleted_at DESC);
CREATE INDEX IF NOT EXISTS trash_items_object_idx ON public.trash_items(object_type, record_id);

CREATE TABLE IF NOT EXISTS public.trash_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  retention_days integer NOT NULL DEFAULT 30 CHECK (retention_days >= 0),
  auto_purge boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.trash_settings TO authenticated;
GRANT ALL ON public.trash_settings TO service_role;
ALTER TABLE public.trash_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read trash settings" ON public.trash_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can write trash settings" ON public.trash_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.trash_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trash_allowed_object(_object_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _object_type IN (
    'patients','appointments','procedures','invoices','pharma_products','pharma_bills',
    'expenses','assets','vendors','services','doctors','staff','campaigns','portal_orders',
    'survey_templates','survey_responses','patient_photos','prescriptions','list_views',
    'problem_areas','tax_master','hsn_tax_master','category_master','unit_master','saved_reports'
  );
$$;

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

CREATE OR REPLACE FUNCTION public.purge_trash_item(_trash_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item public.trash_items;
  days integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO item FROM public.trash_items WHERE id = _trash_id;
  IF NOT FOUND OR item.status <> 'trashed' THEN
    RAISE EXCEPTION 'Trash item not available for deletion';
  END IF;

  SELECT retention_days INTO days FROM public.trash_settings WHERE id;
  days := COALESCE(days, 30);

  IF item.deleted_at > now() - make_interval(days => days) THEN
    RAISE EXCEPTION 'This item can only be permanently deleted after % day(s) in trash (available on %)',
      days, to_char((item.deleted_at + make_interval(days => days)) AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');
  END IF;

  UPDATE public.trash_items
     SET status = 'purged', purged_at = now(), purged_by = auth.uid(), record_data = '{}'::jsonb
   WHERE id = _trash_id;
END;
$$;

REVOKE ALL ON FUNCTION public.move_to_trash(text, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_from_trash(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_trash_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_to_trash(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_from_trash(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_trash_item(uuid) TO authenticated;
