-- Kavya's 3 October appointment was deleted on 2 October and was back by the
-- next sync. Twelve others with it.
--
-- 20260925200000 built the guard that was supposed to stop this: deleting a
-- Salesforce record leaves a tombstone in sf_deleted_records, and
-- stamp_record_owner refuses any insert carrying one. It works - 95
-- appointments blocked, 249 attempts, still firing today.
--
-- One day later drizzle/migrations/0012_restore_rescheduled_appointments.sql
-- replaced stamp_record_owner with a version that, when the incoming
-- start_time differs from the one in the trash snapshot, concludes the delete
-- applied to the old slot, DELETES the tombstone and lets the row in. It was
-- written for a real case (Sumana, 26 Sep): staff deleted a stale slot here,
-- the visit moved in Salesforce, and the new time never appeared.
--
-- But a time difference is not a reschedule. Of the thirteen appointments that
-- came back, every single one differed - Shwetha by five minutes, Pradhyumna
-- and Radhika by fifteen, Kavya by forty-five. That is ordinary drift between
-- what the app holds and what Salesforce holds. And the lift is permanent: it
-- removes the tombstone, so from that moment the deletion is void for good and
-- every later sync is free to re-insert.
--
-- The clinic deletes an appointment, not a slot. Identity is the Salesforce id;
-- moving it in time does not make it a different appointment, and a genuinely
-- new booking carries a new sf_id and is untouched by any of this. Where a
-- moved visit really is wanted back, the Trash page restores it in one click -
-- which lifts the tombstone deliberately. That is a decision someone makes,
-- not one a five-minute difference makes for them.
--
-- This supersedes drizzle/migrations/0012, which is the tree that last defined
-- this function. The two are easy to miss.

-- 1. The guard, as it was before the lift --------------------------------------

create or replace function public.stamp_record_owner()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  incoming_sf_id text;
  suppression    text;
begin
  if TG_OP = 'INSERT' then
    -- Returning NULL skips the row silently. That is deliberate: the importer
    -- inserts in batches of 100 with a plain INSERT, so raising would throw
    -- away 99 good rows along with the one we do not want. Silent is not the
    -- same as untraceable - every skip is counted in sf_suppressed_inserts.
    --
    -- Read through to_jsonb because this same function guards pharma_bills,
    -- which has no sf_id column at all.
    incoming_sf_id := to_jsonb(NEW) ->> 'sf_id';
    if incoming_sf_id is not null then
      suppression := public.sf_suppression_reason(TG_TABLE_NAME::text, incoming_sf_id);
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

-- 2. Stop the guard depending on a second copy of the fact ---------------------
--
-- trash_items is written in the same transaction as the delete and is present
-- for all thirteen of these. sf_deleted_records says the same thing in a second
-- place, and a second copy of a fact is the copy that goes missing - these
-- thirteen are what that looks like. Either is enough now.
--
-- Only 'trashed' counts, so restoring still works exactly as it does: the item
-- becomes 'restored' and the block lifts. The sf_deleted_records check stays,
-- because a purged item keeps its tombstone and a purge must not resurrect
-- anything.

create index if not exists idx_trash_items_sf_id
  on public.trash_items ((record_data->>'sf_id'))
  where status = 'trashed';

create or replace function public.sf_suppression_reason(_object_type text, _sf_id text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_dupe boolean;
begin
  if _sf_id is null then
    return null;
  end if;

  -- Only the three things sf-import-clinical inserts. Patients are deliberately
  -- left out: tombstoning a patient would stop their whole clinical feed
  -- importing, silently and for good. They also already carry a UNIQUE index on
  -- sf_id, so the duplicate half would buy nothing.
  if _object_type not in ('appointments', 'procedures', 'invoices') then
    return null;
  end if;

  if exists (
    select 1 from public.sf_deleted_records d
     where d.object_type = _object_type and d.sf_id = _sf_id
  ) then
    return 'deleted_here';
  end if;

  if exists (
    select 1 from public.trash_items t
     where t.object_type = _object_type
       and t.status = 'trashed'
       and t.record_data->>'sf_id' = _sf_id
  ) then
    return 'deleted_here';
  end if;

  execute format('select exists (select 1 from public.%I t where t.sf_id = $1)', _object_type)
    into v_dupe using _sf_id;

  if v_dupe then
    return 'duplicate_sf_id';
  end if;

  return null;
end;
$$;

revoke all on function public.sf_suppression_reason(text, text) from public, anon;
grant execute on function public.sf_suppression_reason(text, text) to authenticated, service_role;

-- 3. The tombstones the lift removed ------------------------------------------
--
-- Idempotent, and the same shape as step 7 of 20260925200000: the latest trash
-- row per sf_id, only where it is still trashed, so a deliberate restore is
-- never overridden.

insert into public.sf_deleted_records (object_type, sf_id, record_label, deleted_at, deleted_by)
select distinct on (t.object_type, t.record_data->>'sf_id')
       t.object_type, t.record_data->>'sf_id', t.record_label, t.deleted_at, t.deleted_by
from public.trash_items t
where t.status = 'trashed'
  and t.restored_at is null
  and t.record_data->>'sf_id' is not null
  and t.object_type in ('appointments','procedures','invoices')
order by t.object_type, t.record_data->>'sf_id', t.deleted_at desc
on conflict (object_type, sf_id) do nothing;

-- 4. Rows that came back and were then worked on are keepers -------------------
--
-- Shahanaz, Parikshith and Nilofer Khan: a bill or a procedure hangs off each,
-- so the clinic has gone on using them and the old delete intent is stale.
-- Recorded as truth in the trash, not just by lifting the tombstone, because
-- step 3 is idempotent and would otherwise re-tombstone them on its next run.

update public.trash_items t
   set status = 'restored', restored_at = now()
 where t.object_type = 'appointments'
   and t.status = 'trashed'
   and t.record_data->>'sf_id' is not null
   and exists (
     select 1 from public.appointments a
      where a.sf_id = t.record_data->>'sf_id'
        and (exists (select 1 from public.invoices i   where i.appointment_id = a.id)
          or exists (select 1 from public.procedures p where p.appointment_id = a.id))
   );

delete from public.sf_deleted_records d
where d.object_type = 'appointments'
  and exists (
    select 1 from public.appointments a
     where a.sf_id = d.sf_id
       and (exists (select 1 from public.invoices i   where i.appointment_id = a.id)
         or exists (select 1 from public.procedures p where p.appointment_id = a.id))
  );

-- 5. Remove what came back and was never used ---------------------------------
--
-- Kavya's among them. Only where nothing points at the row: two child tables
-- are ON DELETE CASCADE (appointment_sticky_notes, patient_feedback), so they
-- are checked as well as invoices and procedures. Every one stays recoverable
-- from its own trash_items snapshot.

delete from public.appointments a
using public.sf_deleted_records d
where d.object_type = 'appointments'
  and d.sf_id = a.sf_id
  and not exists (select 1 from public.invoices i                 where i.appointment_id = a.id)
  and not exists (select 1 from public.procedures p               where p.appointment_id = a.id)
  and not exists (select 1 from public.appointment_sticky_notes n where n.appointment_id = a.id)
  and not exists (select 1 from public.patient_feedback f         where f.appointment_id = a.id);
