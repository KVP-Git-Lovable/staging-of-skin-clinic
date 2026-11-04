-- A deleted appointment that Salesforce later moves to a new time comes back.
--
-- The tombstone in sf_deleted_records exists so a deliberate delete is not
-- undone by the sync re-inserting the same visit five minutes later. But it
-- also blocked a genuine reschedule: staff delete the old slot here, the
-- clinic moves the visit in Salesforce, and the new time never appears
-- (Sumana, 26 Sep).
--
-- Fix: when the guard is about to skip an appointments insert because of a
-- tombstone, compare the incoming start_time with the start_time saved in the
-- trash snapshot. A different time means Salesforce rescheduled the visit -
-- the tombstone's job (keeping the OLD slot deleted) is done, so lift it and
-- let the new row in. Same time means the sync is just re-offering the visit
-- staff deleted, and the skip stands.

create or replace function public.stamp_record_owner()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  incoming_sf_id text;
  suppression    text;
  trashed_start  timestamptz;
begin
  if TG_OP = 'INSERT' then
    -- Returning NULL skips the row silently. That is deliberate: the importer
    -- inserts in batches of 100 with a plain INSERT, so raising would throw
    -- away 99 good rows along with the one we do not want. Silent is not the
    -- same as untraceable - every skip is counted in sf_suppressed_inserts.
    incoming_sf_id := to_jsonb(NEW) ->> 'sf_id';
    if incoming_sf_id is not null then
      suppression := public.sf_suppression_reason(TG_TABLE_NAME::text, incoming_sf_id);

      if suppression = 'deleted_here' and TG_TABLE_NAME = 'appointments' then
        select (t.record_data->>'start_time')::timestamptz into trashed_start
          from public.trash_items t
         where t.object_type = 'appointments'
           and t.record_data->>'sf_id' = incoming_sf_id
         order by t.deleted_at desc
         limit 1;

        if trashed_start is not null
           and to_jsonb(NEW)->>'start_time' is not null
           and (to_jsonb(NEW)->>'start_time')::timestamptz <> trashed_start then
          -- Rescheduled in Salesforce: the delete applied to the old slot, not
          -- this one. Lift the tombstone and let the row in.
          delete from public.sf_deleted_records
           where object_type = 'appointments' and sf_id = incoming_sf_id;
          suppression := null;
        end if;
      end if;

      if suppression is not null then
        perform public.sf_note_suppressed_insert(TG_TABLE_NAME::text, incoming_sf_id, suppression);
        return null;
      end if;
    end if;

    NEW.owner_id := coalesce(NEW.owner_id, auth.uid());
  else
    NEW.owner_id := coalesce(NEW.owner_id, OLD.owner_id, auth.uid());
  end if;
  return NEW;
end;
$$;