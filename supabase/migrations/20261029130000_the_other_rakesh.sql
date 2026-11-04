-- The 13 Oct visit belongs to the other Rakesh.
--
-- Two different patients share a first name, and a visit on 13 Oct 2026 was
-- booked against the wrong one. They are not duplicates - different phones,
-- different dates of birth, 1981 against 2002 - so this moves one visit and
-- leaves both profiles standing.
--
--   from  2a1d8e7e  Rakesh         7406868857  dob 2002-09-27
--   to    50f456b7  Rakesh Salian  7892323314  dob 1981-09-18
--
-- The visit carries one bill (INV-49608, Rs 10,900, Acne PIH Treatment) and
-- one clinical sticky note. The note is keyed on the appointment and holds no
-- patient of its own, so it follows without being touched. Nothing else hangs
-- off the appointment: photos, procedures, feedback, surveys, AI repository,
-- attachments, call logs and child appointments were all counted and are zero.
--
-- patient_name is updated alongside patient_id on BOTH tables. It is a
-- denormalised copy rather than a join, and the invoice PDF prints from it, so
-- moving the id alone would leave the bill still saying "Rakesh".
--
-- The other three visits on the source profile - 9 Jun, 28 Oct, and the 30 Nov
-- follow-up booked during the 28 Oct visit - are his and stay where they are.

do $$
declare
  v_appt    uuid := '880ce33e-2b1a-46f4-83f0-809fc54fefe2';
  v_from    uuid := '2a1d8e7e-b6ff-4a1f-a827-b03c24ab7b2c';
  v_to      uuid := '50f456b7-81bc-4bf5-92ec-d857521407e3';
  v_name    text;
  n_appt    int;
  n_inv     int;
  n_left    int;
begin
  if not exists (select 1 from public.patients where id = v_to) then
    raise notice 'Rakesh Salian % is not here - nothing moved', v_to;
    return;
  end if;

  if not exists (select 1 from public.appointments where id = v_appt and patient_id = v_from) then
    raise notice 'Appointment % is not on the source profile - already moved, nothing to do', v_appt;
    return;
  end if;

  -- The name as the destination record actually spells it, rather than one
  -- typed in here and left to drift from it.
  select btrim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')) into v_name
    from public.patients where id = v_to;

  update public.appointments
     set patient_id = v_to, patient_name = v_name
   where id = v_appt and patient_id = v_from;
  get diagnostics n_appt = row_count;

  update public.invoices
     set patient_id = v_to, patient_name = v_name
   where appointment_id = v_appt;
  get diagnostics n_inv = row_count;

  -- Nothing on this visit may still point at the patient it came from.
  select (select count(*) from public.invoices       where appointment_id = v_appt and patient_id = v_from)
       + (select count(*) from public.patient_photos where appointment_id = v_appt and patient_id = v_from)
       + (select count(*) from public.procedures     where appointment_id = v_appt and patient_id = v_from)
       + (select count(*) from public.survey_responses where appointment_id = v_appt and patient_id = v_from)
       + (select count(*) from public.patient_feedback where appointment_id = v_appt and patient_id = v_from)
       + (select count(*) from public.appointments   where id = v_appt and patient_id = v_from)
    into n_left;

  if n_left > 0 then
    raise exception 'Move incomplete: % row(s) on appointment % still belong to % - nothing has been changed',
      n_left, v_appt, v_from;
  end if;

  raise notice 'Moved % appointment and % invoice(s) to % (%)', n_appt, n_inv, v_name, v_to;
end $$;
