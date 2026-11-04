-- Deleting a Salesforce appointment must actually delete it.
--
-- Staff deleted Volita's duplicate 25 September appointment at 11:30 PM and it
-- was back by morning. Not one patient: 20 deleted appointments had already
-- come back, and two (Sweedal, Alima Rifna) had been deleted twice because the
-- first delete did not hold.
--
-- The loop:
--   1. move_to_trash copies the row into trash_items and then HARD-DELETEs it.
--   2. sf-import-clinical works out what it has already imported solely by
--      reading which sf_id values are present in the live table
--      (functions/sf-import-clinical/index.ts:352-362), then plain-INSERTs the
--      rest (:466-471). No upsert, no conflict target, no notion of "deleted".
--   3. So the delete destroys the only evidence the importer has, and pg_cron
--      re-runs it every five minutes.
--
-- It hid itself too: mapAppt sets created_at/updated_at from Salesforce's
-- CreatedDate (:457-458), so a resurrected row looks as old as the original.
--
-- The edge function cannot be redeployed from here, so the fix is entirely in
-- the database and works against the importer unchanged.

-- 1. The evidence that survives the delete ------------------------------------

create table if not exists public.sf_deleted_records (
  object_type  text not null,
  sf_id        text not null,
  record_label text,
  deleted_at   timestamptz not null default now(),
  deleted_by   uuid,
  primary key (object_type, sf_id)
);

comment on table public.sf_deleted_records is
  'Records the clinic deliberately deleted that came from Salesforce. The importer decides what it has already imported by looking for the sf_id in the live table, so a delete used to erase the only evidence it had and the row came back within hours. This is that evidence, kept after the row is gone.';

alter table public.sf_deleted_records enable row level security;
revoke all on public.sf_deleted_records from anon, authenticated;

-- 2. Proof that the guard is working, since the skip itself is silent ---------

create table if not exists public.sf_suppressed_inserts (
  object_type text not null,
  sf_id       text not null,
  reason      text not null,
  attempts    bigint not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (object_type, sf_id)
);

comment on table public.sf_suppressed_inserts is
  'Every time the guard skips a Salesforce insert, counted here. The skip is silent by design - the importer inserts 100 rows at a time and raising would throw away 99 good ones - so without this there would be no way to tell the guard from a broken sync.';

alter table public.sf_suppressed_inserts enable row level security;
revoke all on public.sf_suppressed_inserts from anon, authenticated;

create or replace function public.sf_note_suppressed_insert(_object_type text, _sf_id text, _reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sf_suppressed_inserts (object_type, sf_id, reason)
  values (_object_type, _sf_id, _reason)
  on conflict (object_type, sf_id) do update
    set attempts  = public.sf_suppressed_inserts.attempts + 1,
        last_seen = now(),
        reason    = excluded.reason;
end;
$$;

revoke all on function public.sf_note_suppressed_insert(text, text, text) from public, anon;
grant execute on function public.sf_note_suppressed_insert(text, text, text) to authenticated, service_role;

-- 3. The one place that decides what may not be inserted ----------------------
--
-- SECURITY DEFINER matters: the triggers below are SECURITY INVOKER, so reading
-- sf_deleted_records inline would either fail outright for app users or, with a
-- grant, silently read nothing through RLS. Both are wrong.

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

-- 4. The guard itself ---------------------------------------------------------
--
-- Carried inside stamp_record_owner rather than in a trigger of its own on
-- purpose: it is already BEFORE INSERT on every table the importer writes, and
-- CREATE OR REPLACE FUNCTION takes no table lock, while CREATE TRIGGER needs
-- ACCESS EXCLUSIVE on a table the sync writes to every five minutes - which has
-- timed out repeatedly on this table.

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

-- 5. Deleting records the tombstone ------------------------------------------

create or replace function public.move_to_trash(_object_type text, _record_id uuid, _label text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  row_json jsonb;
  new_id uuid;
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

  insert into public.trash_items (object_type, record_id, record_label, record_data, deleted_by, deleted_by_name)
  values (_object_type, _record_id, _label, row_json, auth.uid(),
          (select email from auth.users where id = auth.uid()))
  returning id into new_id;

  -- Remember that this Salesforce record was deleted on purpose, before the
  -- DELETE below destroys the only evidence the importer reads.
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
$$;

-- 6. Restoring lifts it again -------------------------------------------------

create or replace function public.restore_from_trash(_trash_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item public.trash_items;
  v_sf text;
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
    -- Lift the tombstone BEFORE re-inserting, never after. The insert below
    -- goes through the guard, which skips any row whose sf_id the clinic
    -- deleted - so with the tombstone still in place a restore would report
    -- success and put nothing back. Lifting it also hands the record back to
    -- Salesforce: undoing the delete means undoing the suppression.
    delete from public.sf_deleted_records
     where object_type = item.object_type
       and sf_id = v_sf;

    -- And if the record is already back (the sync re-created it before this
    -- shipped), say so rather than silently inserting nothing and then marking
    -- the trash item restored, which would strand it for good.
    if public.sf_suppression_reason(item.object_type, v_sf) = 'duplicate_sf_id' then
      raise exception 'That % is already back in the app (Salesforce id %) - nothing to restore',
        item.object_type, v_sf;
    end if;
  end if;

  execute format('INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
                 item.object_type, item.object_type) using item.record_data;

  update public.trash_items
     set status = 'restored', restored_at = now(), restored_by = auth.uid()
   where id = _trash_id;
end;
$$;

-- 7. Make every past delete take effect ---------------------------------------
--
-- Latest trash row per sf_id, and only where it is still trashed, so a
-- deliberate past restore is never overridden. Idempotent.

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

-- 8. Rows that came back and were then billed against are keepers -------------
--
-- Something was billed or prescribed against them after they returned, so the
-- old delete intent is stale. Record that as truth in the trash, not just by
-- removing the tombstone: step 7 is idempotent and would otherwise re-tombstone
-- them the next time it runs.

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

-- 9. Remove what has already come back ----------------------------------------
--
-- Checked first: two child tables are ON DELETE CASCADE
-- (appointment_sticky_notes, patient_feedback) and none of these rows had any.
-- Every one is still recoverable from its trash_items snapshot.

delete from public.appointments a
using public.sf_deleted_records d
where d.object_type = 'appointments'
  and d.sf_id = a.sf_id
  and not exists (select 1 from public.invoices i                 where i.appointment_id = a.id)
  and not exists (select 1 from public.procedures p               where p.appointment_id = a.id)
  and not exists (select 1 from public.appointment_sticky_notes n where n.appointment_id = a.id)
  and not exists (select 1 from public.patient_feedback f         where f.appointment_id = a.id);
