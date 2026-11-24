-- More than one pair of hands on an appointment.
--
-- An appointment recorded one therapist. In practice more than one person
-- assists a procedure, and nurses assist as often as therapists do, so the
-- clinic asked for both roles in the picker and for more than one to be
-- chosen. Before this the extra names were typed into the notes by hand, or
-- lost - the same thing therapist_id itself was added to stop.
--
-- Nothing new is invented here. Procedures already solved this exact problem:
-- procedures.assisted_by holds the first person and assisted_by_ids uuid[]
-- holds them all, the screens write both, and readers take assisted_by_ids
-- when it has anything in it and fall back to assisted_by when it does not.
-- Appointments now do the same, so there is one pattern in the codebase
-- rather than two.
--
-- Why the old column stays and keeps being written:
--
--   AGENTS.md - a schema change must keep the CURRENTLY PUBLISHED build
--   working with no deploy. clinic.quickapp.ai reads and writes
--   therapist_id and nothing else. Leaving it in place and filling it with
--   the first person chosen means the published build keeps showing a
--   therapist on every appointment, and an appointment it saves keeps
--   working here - therapist_ids comes back empty and the fallback reads
--   therapist_id. Neither build can lose the other's work.
--
-- Backward-compatible: one added column, nullable in effect because it has a
-- default, no column renamed or dropped, no foreign key (appointments has two
-- routes to staff already, and this adds no third - so there is nothing to
-- register in AMBIGUOUS_EMBEDS), and the published build never names it.

-- ── 1. Room for everyone who assisted ──
--
-- NOT NULL with a default rather than a nullable array: '{}' and NULL would
-- otherwise both mean "nobody", and every reader would have to handle two
-- spellings of the same thing. Same shape as procedures.assisted_by_ids.

alter table public.appointments
  add column if not exists therapist_ids uuid[] not null default '{}'::uuid[];

comment on column public.appointments.therapist_ids is
  'Everyone who carried out the treatment, in the order chosen. therapist_id holds the first of them and is what the published build reads; readers take this when it is non-empty and fall back to therapist_id when it is not. Mirrors procedures.assisted_by_ids.';

-- ── 2. Carry every therapist already recorded into the new column ──
--
-- Without this an appointment booked before today would show nobody the
-- moment a screen started reading the array. Only rows that have a therapist
-- and no array yet are touched, so this is re-runnable and cannot overwrite a
-- list someone has since chosen.

update public.appointments
   set therapist_ids = array[therapist_id]
 where therapist_id is not null
   and coalesce(array_length(therapist_ids, 1), 0) = 0;

-- ── 3. Stop a name outliving the person it names ──
--
-- set_appointment_therapist_name() filled therapist_name only when
-- therapist_id was not null, and never cleared it. Unassigning therefore left
-- the old name on the row, and therapist_name is what the Appointments list,
-- the reports and therapistDisplayName() all prefer - so the appointment went
-- on naming a therapist who was no longer on it.
--
-- That was already wrong; removing the last person from the new picker makes
-- it easy to hit. The name is still the first person's, so the list column
-- and every saved report read exactly as they did before.

create or replace function public.set_appointment_therapist_name()
returns trigger
language plpgsql
as $fn$
begin
  if new.therapist_id is null then
    new.therapist_name := null;
  else
    select btrim(s.first_name || ' ' || coalesce(s.last_name, ''))
      into new.therapist_name
      from public.staff s
     where s.id = new.therapist_id;
  end if;
  return new;
end;
$fn$;
