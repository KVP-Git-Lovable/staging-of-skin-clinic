-- Trash functions: only staff may move/restore, and restore only ever writes
-- into tables the Trash knows about (the allow-listed record types and the
-- tables that hang off them by a real foreign key). The two helper functions
-- are no longer callable from the app at all.

-- 1. Checks a Trash entry's saved child rows against the real foreign keys,
--    so a restore can only put rows back into tables linked to the record.
CREATE OR REPLACE FUNCTION public.trash_child_data_problem(_root_table text, _root_id uuid, _child_data jsonb)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
declare
  parents jsonb := jsonb_build_object(_root_table, jsonb_build_array(_root_id));
  entry   jsonb;
  grp     jsonb;
  r       jsonb;
  tbl     text;
  col     text;
  tgt     text;
begin
  if _child_data is null or _child_data = 'null'::jsonb then
    return null;
  end if;
  if jsonb_typeof(_child_data) <> 'array' then
    return 'saved linked records are not a list';
  end if;

  for entry in select * from jsonb_array_elements(_child_data) loop
    if jsonb_typeof(entry) <> 'object' then
      return 'a saved linked record entry is malformed';
    end if;
    tbl := entry->>'table';
    col := entry->>'column';
    if tbl is null or col is null or to_regclass(format('public.%I', tbl)) is null then
      return format('linked table %s is not a table in this app', coalesce(tbl, '(none)'));
    end if;

    -- the column must be a real single-column foreign key onto the id of a
    -- table already being restored, with ON DELETE SET NULL / CASCADE
    select tcl.relname into tgt
      from pg_constraint c
      join pg_class      tcl on tcl.oid = c.confrelid
      join pg_namespace  tn  on tn.oid  = tcl.relnamespace
      join pg_attribute  ca  on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
      join pg_attribute  pa  on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
     where c.contype = 'f'
       and c.conrelid = to_regclass(format('public.%I', tbl))
       and cardinality(c.conkey) = 1
       and ca.attname = col
       and pa.attname = 'id'
       and tn.nspname = 'public'
       and c.confdeltype in ('n', 'c')
       and parents ? tcl.relname
     limit 1;
    if tgt is null then
      return format('%s.%s is not linked to the record being restored', tbl, col);
    end if;

    if not exists (
      select 1 from pg_attribute x
       where x.attrelid = to_regclass(format('public.%I', tbl))
         and x.attname = 'id' and x.attnum > 0 and not x.attisdropped) then
      return format('linked table %s has no id column', tbl);
    end if;

    if entry->>'rule' = 'set_null' then
      if jsonb_typeof(entry->'groups') <> 'array' then
        return format('saved links for %s are malformed', tbl);
      end if;
      for grp in select * from jsonb_array_elements(entry->'groups') loop
        if not ((parents->tgt) @> jsonb_build_array(grp->'parent')) then
          return format('%s.%s points at a record that is not being restored', tbl, col);
        end if;
      end loop;

    elsif entry->>'rule' = 'cascade' then
      if jsonb_typeof(entry->'rows') <> 'array' then
        return format('saved rows for %s are malformed', tbl);
      end if;
      for r in select * from jsonb_array_elements(entry->'rows') loop
        if jsonb_typeof(r) <> 'object'
           or not ((parents->tgt) @> jsonb_build_array(r->col)) then
          return format('a saved %s row is not linked to the record being restored', tbl);
        end if;
        if r ? 'id' and r->'id' <> 'null'::jsonb then
          parents := jsonb_set(parents, array[tbl],
                               coalesce(parents->tbl, '[]'::jsonb) || jsonb_build_array(r->'id'));
        end if;
      end loop;

    else
      return format('unknown restore rule for %s', tbl);
    end if;
  end loop;

  return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.trash_child_data_problem(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_child_data_problem(text, uuid, jsonb) TO service_role;

-- 2. Restoring linked rows now needs the record it belongs to, and refuses
--    anything the check above rejects. Replaces trash_restore_children(jsonb).
CREATE OR REPLACE FUNCTION public.trash_restore_children(_root_table text, _root_id uuid, _child_data jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
declare
  problem text;
  entry   jsonb;
  grp     jsonb;
  ids     uuid[];
  cols    text;
begin
  problem := public.trash_child_data_problem(_root_table, _root_id, _child_data);
  if problem is not null then
    raise exception 'This Trash item cannot be restored: % - nothing has been changed', problem;
  end if;

  for entry in select * from jsonb_array_elements(coalesce(_child_data, '[]'::jsonb)) loop
    if entry->>'rule' = 'set_null' then
      for grp in select * from jsonb_array_elements(entry->'groups') loop
        select coalesce(array_agg(v::uuid), '{}'::uuid[]) into ids
          from jsonb_array_elements_text(grp->'ids') v;
        continue when cardinality(ids) = 0;

        execute format('update public.%I set %I = $1 where id = any($2) and %I is null',
                       entry->>'table', entry->>'column', entry->>'column')
          using (grp->>'parent')::uuid, ids;
      end loop;
    else
      cols := public.trash_insertable_columns(entry->>'table');
      continue when cols is null;

      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                     entry->>'table', cols, cols, entry->>'table')
        using entry->'rows';
    end if;
  end loop;
end;
$function$;

REVOKE ALL ON FUNCTION public.trash_restore_children(text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_restore_children(text, uuid, jsonb) TO service_role;

-- 3. Restore: staff only, and only allow-listed record types.
CREATE OR REPLACE FUNCTION public.restore_from_trash(_trash_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item     public.trash_items;
  v_sf     text;
  v_back   boolean;
  v_has_id boolean;
  v_cols   text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_staff() then
    raise exception 'Only clinic staff can restore from Trash' using errcode = '42501';
  end if;

  if not public.can_restore_trash_item(_trash_id) then
    raise exception 'You can only restore records you deleted';
  end if;

  select * into item from public.trash_items where id = _trash_id;
  if not found or item.status <> 'trashed' then
    raise exception 'Trash item not available for restore';
  end if;

  IF item.object_type = 'knowledge_articles' THEN
    IF NOT public.can_manage_knowledge() THEN RAISE EXCEPTION 'Only doctors and admins can restore articles'; END IF;
    UPDATE public.knowledge_articles SET deleted_at=NULL WHERE id=item.record_id AND deleted_at IS NOT NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article is already restored or unavailable'; END IF;
    UPDATE public.trash_items SET status='restored',restored_at=now(),restored_by=auth.uid() WHERE id=_trash_id;
    RETURN;
  END IF;

  if not public.trash_allowed_object(item.object_type) then
    raise exception 'The % table is not one this app knows how to restore', item.object_type;
  end if;
  if item.record_data ? 'id' and item.record_data->>'id' is distinct from item.record_id::text then
    raise exception 'This Trash item does not match the record it was saved from - nothing has been changed';
  end if;

  v_sf := item.record_data->>'sf_id';

  if v_sf is not null then
    delete from public.sf_deleted_records
     where object_type = item.object_type
       and sf_id = v_sf;

    if public.sf_suppression_reason(item.object_type, v_sf) = 'duplicate_sf_id' then
      raise exception 'That % is already back in the app (Salesforce id %) - nothing to restore',
        item.object_type, v_sf;
    end if;
  end if;

  update public.trash_items
     set status = 'restored', restored_at = now(), restored_by = auth.uid()
   where id = _trash_id;

  v_cols := public.trash_insertable_columns(item.object_type);
  if v_cols is null then
    raise exception 'The % table is not one this app knows how to restore', item.object_type;
  end if;

  execute format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, v_cols, v_cols, item.object_type) using item.record_data;

  select exists (
    select 1 from information_schema.columns c
     where c.table_schema = 'public'
       and c.table_name = item.object_type
       and c.column_name = 'id'
  ) into v_has_id;

  if v_has_id then
    execute format('select exists (select 1 from public.%I t where t.id = $1)', item.object_type)
      into v_back using item.record_id;
    if not v_back then
      raise exception 'The % could not be put back - nothing has been changed', item.object_type;
    end if;
  end if;

  perform public.trash_restore_children(item.object_type, item.record_id, item.child_data);
end;
$function$;

DROP FUNCTION IF EXISTS public.trash_restore_children(jsonb);

REVOKE ALL ON FUNCTION public.restore_from_trash(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_from_trash(uuid) TO authenticated, service_role;

-- 4. Move to Trash: staff only (record type was already allow-listed).
CREATE OR REPLACE FUNCTION public.move_to_trash(_object_type text, _record_id uuid, _label text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row_json jsonb;
  kids     jsonb;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_active_staff() then
    raise exception 'Only clinic staff can delete records' using errcode = '42501';
  end if;
  if not public.trash_allowed_object(_object_type) then
    raise exception 'Object % is not enabled for trash', _object_type;
  end if;

  if not public.can_trash_record(_object_type, _record_id) then
    raise exception 'You can only delete your own records';
  end if;

  execute format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', _object_type)
    into row_json using _record_id;

  if row_json is null then
    raise exception 'Record not found';
  end if;

  kids := public.trash_capture_children(_object_type, _record_id);

  insert into public.trash_items (object_type, record_id, record_label, record_data, child_data, deleted_by, deleted_by_name)
  values (_object_type, _record_id, _label, row_json, kids, auth.uid(),
          (select email from auth.users where id = auth.uid()))
  returning id into new_id;

  if row_json ? 'sf_id' and row_json->>'sf_id' is not null then
    insert into public.sf_deleted_records (object_type, sf_id, record_label, deleted_at, deleted_by)
    values (_object_type, row_json->>'sf_id', _label, now(), auth.uid())
    on conflict (object_type, sf_id) do update
      set record_label = excluded.record_label,
          deleted_at   = excluded.deleted_at,
          deleted_by   = excluded.deleted_by;
  end if;

  execute format('DELETE FROM public.%I WHERE id = $1', _object_type) using _record_id;

  return new_id;
end;
$function$;

REVOKE ALL ON FUNCTION public.move_to_trash(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_to_trash(text, uuid, text) TO authenticated, service_role;

-- 5. Capturing linked rows is only ever done inside move_to_trash.
ALTER FUNCTION public.trash_capture_children(text, uuid) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.trash_capture_children(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trash_capture_children(text, uuid) TO service_role;

-- 6. Trash entries are written only by the Trash functions, never directly
--    by the app, so a hand-made entry cannot be "restored" into a table.
DROP POLICY IF EXISTS "Authenticated can insert trash" ON public.trash_items;
DROP POLICY IF EXISTS "Authenticated can update trash" ON public.trash_items;
DROP POLICY IF EXISTS "scope trash_items to own upd" ON public.trash_items;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.trash_items FROM anon, authenticated;
REVOKE ALL ON public.trash_items FROM anon;
