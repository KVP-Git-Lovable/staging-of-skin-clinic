-- Trash restore has been failing on every patient.
--
-- The clinic pressed Restore on four patients and got:
--
--   cannot insert a non-DEFAULT value into column "registered_at"
--
-- restore_from_trash() puts a record back with
--
--   INSERT INTO public.<table> SELECT * FROM jsonb_populate_record(...)
--
-- and `SELECT *` hands Postgres every column, generated ones included.
-- public.patients has three GENERATED ALWAYS columns - registered_at,
-- phone_last10 and alternate_phone_last10 - so the insert is refused and
-- NO patient can be restored from the Trash at all. The same line exists in
-- trash_restore_children(), so a patient's appointments, procedures,
-- prescriptions and photos could not come back either.
--
-- The Trash page has been offering a Restore button that cannot work.
--
-- The fix is to name the columns instead of using *, leaving out the
-- generated ones so the database recomputes them - which is what generated
-- columns are for. registered_at is COALESCE(sf_registered_at, created_at)
-- and the two _last10 columns are derived from the phone numbers, so all
-- three come back identical without being written.
--
-- Nothing else changes: same function names, same arguments, same
-- permission checks, same audit writes. The published build calls these
-- through the same RPC it always did.

create or replace function public.trash_insertable_columns(_table text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $fn$
  -- Every column except the generated ones, which the database fills itself.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    from information_schema.columns
   where table_schema = 'public'
     and table_name = _table
     and coalesce(is_generated, 'NEVER') <> 'ALWAYS';
$fn$;

comment on function public.trash_insertable_columns(text) is
  'Column list for restoring a trashed row: everything a generated column is not. Used by restore_from_trash and trash_restore_children, which previously used SELECT * and were refused on any table with a generated column.';

create or replace function public.restore_from_trash(_trash_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- Named columns, not *: a generated column cannot be written to.
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

  perform public.trash_restore_children(item.child_data);
end;
$function$;

create or replace function public.trash_restore_children(_child_data jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  entry jsonb;
  grp   jsonb;
  ids   uuid[];
  cols  text;
begin
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
      -- Named columns here too, for the same reason.
      cols := public.trash_insertable_columns(entry->>'table');
      continue when cols is null;

      execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                     entry->>'table', cols, cols, entry->>'table')
        using entry->'rows';
    end if;
  end loop;
end;
$function$;
