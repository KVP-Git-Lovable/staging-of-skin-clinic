-- A restore that reports success must actually put the record back.
--
-- Aysha's 19 August appointment was deleted and restored from Trash. Trash
-- said "Restored"; the appointment was in neither the Appointments list nor
-- the patient's record, because it had never gone back into the table.
--
-- The reason is an order of events. A record that came from Salesforce is
-- guarded on insert by stamp_record_owner, which asks sf_suppression_reason
-- whether that Salesforce id was deleted here - and that question is answered
-- "yes" by, among other things, a trash item still reading 'trashed'. The
-- restore inserted the row FIRST and marked the trash item restored after, so
-- the guard was still looking at a trashed item, returned null from the
-- trigger, and the insert was skipped in silence. The update that followed
-- then marked the item restored, which is also why it could not be restored a
-- second time: the function only restores an item that still reads 'trashed'.
--
-- So the item is marked restored BEFORE the row goes back - one transaction,
-- so a failure below takes the status with it - and the function now checks
-- that the record really is back, raising rather than reporting a restore
-- that did not happen.
--
-- Six appointments were restored into silence this way. Five have since been
-- re-created by the Salesforce sync under new ids and are in the app; Aysha's
-- was put back by hand from the trash item's own copy of the row. A seventh,
-- from 29 August, belongs to a patient who no longer exists and is left alone.
CREATE OR REPLACE FUNCTION public.restore_from_trash(_trash_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  item    public.trash_items;
  v_sf    text;
  v_back  boolean;
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
    -- Lift the tombstone BEFORE re-inserting, never after: the guard skips any
    -- row whose sf_id the clinic deleted. Lifting it also hands the record back
    -- to Salesforce, which is what undoing the delete means.
    delete from public.sf_deleted_records
     where object_type = item.object_type
       and sf_id = v_sf;

    -- Already back (the sync re-created it): say so rather than inserting a
    -- second copy.
    if public.sf_suppression_reason(item.object_type, v_sf) = 'duplicate_sf_id' then
      raise exception 'That % is already back in the app (Salesforce id %) - nothing to restore',
        item.object_type, v_sf;
    end if;
  end if;

  -- Before the insert: a trash item still reading 'trashed' is itself an
  -- answer of "deleted here", and the guard would skip the row.
  update public.trash_items
     set status = 'restored', restored_at = now(), restored_by = auth.uid()
   where id = _trash_id;

  execute format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, item.object_type) using item.record_data;

  -- Never again report a restore that did not happen.
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
end;
$function$;
