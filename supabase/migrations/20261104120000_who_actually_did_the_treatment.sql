-- Record which therapist actually carried out the treatment.
--
-- An appointment has had exactly one person slot since the beginning:
-- staff_id, the doctor. Who performed the treatment was typed into the notes
-- by hand or not recorded at all, so "who treated this patient" had no
-- reliable answer, and swapping a therapist out for an emergency left no
-- trace. The clinic already employs three therapists (staff.role =
-- 'Therapist'); they just had nowhere to be assigned.
--
-- This mirrors how the doctor is already recorded, one for one, rather than
-- inventing a second pattern:
--
--   staff_id      + doctor_name    kept in step by set_appointment_doctor_name
--   therapist_id  + therapist_name kept in step by the trigger below
--
-- (see 20260917020000_record_doctor_name_on_appointments.sql). Following it
-- means the field-history audit, the list and CSV plumbing and the
-- name-survives-a-departure behaviour all work the same way for both.

alter table public.appointments
  add column if not exists therapist_id uuid references public.staff(id) on delete set null,
  add column if not exists therapist_name text;

comment on column public.appointments.therapist_id is
  'The therapist who carried out the treatment. A staff row with role = ''Therapist''. ON DELETE SET NULL, like staff_id: removing a staff member must never remove the visit.';

comment on column public.appointments.therapist_name is
  'Who did the treatment, as a name. Filled from staff when therapist_id is set, and then kept - so a therapist who later leaves the clinic still appears on the visits they worked.';

create index if not exists appointments_therapist_id_idx
  on public.appointments (therapist_id);

-- Keep the name in step without anyone having to remember.
--
-- Only ever FILLS from therapist_id; it never blanks the name. Clearing the
-- assignment therefore leaves the record of who did the work, which is the
-- same bargain set_appointment_doctor_name makes, and the reason a therapist
-- can be deactivated without erasing their history.
create or replace function public.set_appointment_therapist_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.therapist_id is not null then
    select btrim(s.first_name || ' ' || coalesce(s.last_name, ''))
      into new.therapist_name
      from public.staff s
     where s.id = new.therapist_id;
  end if;
  return new;
end;
$$;

drop trigger if exists set_appointment_therapist_name on public.appointments;
create trigger set_appointment_therapist_name
  before insert or update of therapist_id on public.appointments
  for each row execute function public.set_appointment_therapist_name();

-- A swap is the whole point of the feature, so it has to be auditable. The
-- appointments row of history_tracking_config already drives the Field History
-- section on the appointment detail screen; adding one field name to the array
-- is all that is needed, and the existing AFTER UPDATE trigger does the rest.
--
-- Appended rather than replaced. The live config had drifted beyond what
-- 20260926130000 set - it tracks end_time, id, patient_name, service,
-- staff_id, start_time and status - and every one of those had to survive,
-- which a replacing write would have silently undone.
update public.history_tracking_config
   set tracked_fields = (
         select array_agg(distinct f order by f)
           from unnest(tracked_fields || array['therapist_id']) as f
       ),
       is_enabled = true,
       updated_at = now()
 where object_key = 'appointments';

-- If the clinic's config row has somehow never been created, create it with
-- the same set the 20260926130000 migration established, plus the new field.
insert into public.history_tracking_config (object_key, is_enabled, tracked_fields)
select 'appointments', true,
       array['end_time','staff_id','start_time','status','therapist_id']
 where not exists (
   select 1 from public.history_tracking_config where object_key = 'appointments'
 );
