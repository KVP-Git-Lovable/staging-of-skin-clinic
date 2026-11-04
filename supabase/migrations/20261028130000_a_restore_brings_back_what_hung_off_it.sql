-- A restore has to bring back what hung off the record.
--
-- Deleting to Trash copied ONE row into trash_items and then ran a plain
-- DELETE. Postgres then did what the foreign keys said, and nothing wrote down
-- that it had happened:
--
--   ON DELETE SET NULL  the child row survives, but its link is erased
--   ON DELETE CASCADE   the child row is destroyed outright
--
-- restore_from_trash put the one row back and stopped. So a restored
-- appointment came back with its photos, procedures, invoices and survey
-- detached, and its sticky notes and feedback gone for good. A restored
-- PATIENT came back with nothing at all: patients cascade to appointments,
-- photos, procedures, surveys and portal orders.
--
-- The clinic reported it on an appointment for Adarsh. 714 appointments and
-- 14 patients have been through the Trash, so it is not a one-off.
--
-- The fix: write down what hung off the record BEFORE deleting it, and put it
-- back on restore. The snapshot goes in its own column rather than inside
-- record_data, because record_data is fed straight to jsonb_populate_record
-- and read for sf_id - a stray key there would be asking for trouble.

alter table public.trash_items
  add column if not exists child_data jsonb not null default '[]'::jsonb;

comment on column public.trash_items.child_data is
  'What hung off this record when it was deleted, so restore can put it back. '
  'A flat array of entries in capture order (shallowest first), so replaying it '
  'in order never inserts a child before its parent. Empty for anything trashed '
  'before 28 Oct 2026 - those restore exactly as they did before.';

-- Walk down from a record and write down everything that would be lost.
--
-- Breadth-first rather than recursive-per-row: the foreign keys of a table are
-- looked up once per table per level, not once per row. Deleting a patient
-- with a few hundred photos would otherwise spend its time in the catalog.
--
-- Depth is capped. Four levels covers patient -> appointment -> procedure ->
-- attachment, which is the deepest chain here, and the cap is what stops a
-- cascade cycle turning this into a hang.
create or replace function public.trash_capture_children(_object_type text, _record_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  out_data   jsonb := '[]'::jsonb;
  queue      jsonb := jsonb_build_array(jsonb_build_object('table', _object_type, 'ids', jsonb_build_array(_record_id)));
  next_queue jsonb;
  node       jsonb;
  fk         record;
  tbl        text;
  ids        uuid[];
  groups     jsonb;
  rows_json  jsonb;
  kid_ids    uuid[];
  depth      int := 0;
  has_id     boolean;
begin
  while jsonb_array_length(queue) > 0 and depth < 4 loop
    next_queue := '[]'::jsonb;

    for node in select * from jsonb_array_elements(queue) loop
      tbl := node->>'table';
      select coalesce(array_agg(v::uuid), '{}'::uuid[]) into ids
        from jsonb_array_elements_text(node->'ids') v;
      continue when cardinality(ids) = 0;

      for fk in
        select cl.relname as child_table,
               ca.attname as child_col,
               c.confdeltype as del
          from pg_constraint c
          join pg_class     cl on cl.oid = c.conrelid
          join pg_namespace n  on n.oid  = cl.relnamespace
          join pg_attribute ca on ca.attrelid = c.conrelid  and ca.attnum = c.conkey[1]
          join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
         where c.contype = 'f'
           and c.confrelid = to_regclass('public.' || tbl)
           and n.nspname = 'public'
           and cardinality(c.conkey) = 1
           and pa.attname = 'id'
           and c.confdeltype in ('n', 'c')
      loop
        -- Everything below targets child rows by id. One table (
        -- whatsapp_delivery_log) has no id column, so there is no way to
        -- address its rows on the way back; skip it rather than guess.
        select exists (
          select 1 from pg_attribute x
           where x.attrelid = to_regclass('public.' || fk.child_table)
             and x.attname = 'id' and x.attnum > 0 and not x.attisdropped
        ) into has_id;
        continue when not has_id;

        if fk.del = 'n' then
          -- The rows live; only the link dies. Remember which row pointed at
          -- which parent, grouped, so a multi-row restore puts each back on
          -- the record it actually belonged to.
          execute format(
            'select coalesce(jsonb_agg(jsonb_build_object(''parent'', p, ''ids'', i)), ''[]''::jsonb)
               from (select t.%I as p, jsonb_agg(t.id) as i
                       from public.%I t
                      where t.%I = any($1)
                      group by t.%I) g',
            fk.child_col, fk.child_table, fk.child_col, fk.child_col)
            into groups using ids;

          if jsonb_array_length(groups) > 0 then
            out_data := out_data || jsonb_build_object(
              'table', fk.child_table, 'column', fk.child_col,
              'rule', 'set_null', 'groups', groups);
          end if;

        else
          -- The rows are about to cease to exist, so keep them whole. Each one
          -- carries its own foreign key value, so re-inserting it restores the
          -- link as a side effect.
          execute format(
            'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t where t.%I = any($1)',
            fk.child_table, fk.child_col)
            into rows_json using ids;

          if jsonb_array_length(rows_json) > 0 then
            out_data := out_data || jsonb_build_object(
              'table', fk.child_table, 'column', fk.child_col,
              'rule', 'cascade', 'rows', rows_json);

            select coalesce(array_agg((r->>'id')::uuid), '{}'::uuid[]) into kid_ids
              from jsonb_array_elements(rows_json) r
             where r->>'id' is not null;

            if cardinality(kid_ids) > 0 then
              next_queue := next_queue || jsonb_build_object(
                'table', fk.child_table, 'ids', to_jsonb(kid_ids));
            end if;
          end if;
        end if;
      end loop;
    end loop;

    queue := next_queue;
    depth := depth + 1;
  end loop;

  return out_data;
end;
$function$;

-- Replay a snapshot. Entries are in capture order, so a cascaded row is always
-- re-inserted before anything that hung off it.
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
begin
  for entry in select * from jsonb_array_elements(coalesce(_child_data, '[]'::jsonb)) loop
    if entry->>'rule' = 'set_null' then
      for grp in select * from jsonb_array_elements(entry->'groups') loop
        select coalesce(array_agg(v::uuid), '{}'::uuid[]) into ids
          from jsonb_array_elements_text(grp->'ids') v;
        continue when cardinality(ids) = 0;

        -- "and %I is null" is the whole safety of this. If a photo has since
        -- been attached to some other appointment, that is now the truth and
        -- we leave it alone rather than dragging it back to this one.
        execute format('update public.%I set %I = $1 where id = any($2) and %I is null',
                       entry->>'table', entry->>'column', entry->>'column')
          using (grp->>'parent')::uuid, ids;
      end loop;
    else
      -- Each row carries its own foreign key value, so putting it back also
      -- puts the link back. "on conflict do nothing" makes a second run a
      -- no-op rather than an error.
      execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                     entry->>'table', entry->>'table')
        using entry->'rows';
    end if;
  end loop;
end;
$function$;

-- move_to_trash, unchanged except that it now writes the snapshot before the
-- DELETE that would make it impossible to take.
create or replace function public.move_to_trash(_object_type text, _record_id uuid, _label text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  row_json jsonb;
  kids     jsonb;
  new_id   uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.trash_allowed_object(_object_type) then
    raise exception 'Object % is not enabled for trash', _object_type;
  end if;

  -- The check this function never had. Without it the DELETE below ran as the
  -- function owner, straight past every delete policy.
  if not public.can_trash_record(_object_type, _record_id) then
    raise exception 'You can only delete your own records';
  end if;

  execute format('SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1', _object_type)
    into row_json using _record_id;

  if row_json is null then
    raise exception 'Record not found';
  end if;

  -- Before the DELETE, while there is still something to look at.
  kids := public.trash_capture_children(_object_type, _record_id);

  insert into public.trash_items (object_type, record_id, record_label, record_data, child_data, deleted_by, deleted_by_name)
  values (_object_type, _record_id, _label, row_json, kids, auth.uid(),
          (select email from auth.users where id = auth.uid()))
  returning id into new_id;

  -- Remember that this Salesforce record was deleted on purpose. The importer
  -- works out what it has already imported by looking for the sf_id in this
  -- very table, so the DELETE below destroys the only evidence it has and the
  -- row comes back on the next run. This is that evidence, kept after the row
  -- is gone. restore_from_trash lifts it again.
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

-- restore_from_trash, unchanged except that once the record itself is safely
-- back, everything that hung off it goes back too.
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

  execute format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, item.object_type) using item.record_data;

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

  -- Only once the record is demonstrably back, so a child is never re-inserted
  -- against a parent that is not there. Empty for anything trashed before this
  -- migration, which restores exactly as it did before.
  perform public.trash_restore_children(item.child_data);
end;
$function$;

-- The record that was reported.
--
-- Two patients called Adarsh were created 15 minutes apart on 28 Oct, and the
-- work ended up split across them. The one the front desk was looking at
-- (a86a3795, which has a date of birth sitting in its phone field) never had
-- photos. The other one (8d6be5ca) holds 3 photos and 1 procedure - the
-- prescription hangs off that procedure - and its 11:15 appointment was
-- deleted at 07:44 and never restored. The SET NULL wiped those four links on
-- the way out.
--
-- Unambiguous: that patient has exactly one trashed appointment, and all four
-- rows were created inside its lifetime. Every step is guarded, so running
-- this twice, or after someone has fixed it by hand, changes nothing.
do $$
declare
  v_trash uuid := '39b53bee-05bd-4152-b886-911e7806bd2b';
  v_appt  uuid := 'e07e5ad5-7d8a-4798-98f5-8c1e0edb5d0f';
  v_pat   uuid := '8d6be5ca-ec53-4268-a9f6-24a8764457e5';
  rd      jsonb;
  n_photo int;
  n_proc  int;
begin
  select record_data into rd
    from public.trash_items
   where id = v_trash and status = 'trashed';

  if rd is not null then
    insert into public.appointments
    select * from jsonb_populate_record(null::public.appointments, rd)
    on conflict (id) do nothing;

    update public.trash_items
       set status = 'restored', restored_at = now()
     where id = v_trash;
  end if;

  -- Only proceed if the appointment really is back, whether this migration put
  -- it there or someone already had.
  if not exists (select 1 from public.appointments where id = v_appt) then
    raise notice 'Adarsh appointment % is not present - leaving its photos alone', v_appt;
    return;
  end if;

  update public.patient_photos
     set appointment_id = v_appt
   where patient_id = v_pat and appointment_id is null;
  get diagnostics n_photo = row_count;

  update public.procedures
     set appointment_id = v_appt
   where patient_id = v_pat and appointment_id is null;
  get diagnostics n_proc = row_count;

  raise notice 'Adarsh: reattached % photo(s) and % procedure(s) to %', n_photo, n_proc, v_appt;
end $$;
