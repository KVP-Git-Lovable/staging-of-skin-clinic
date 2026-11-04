-- One Adarsh, not two.
--
-- The same visit was written down twice on 28 Oct, 15 minutes apart, and the
-- work split across the two records: the clinical side landed on one and the
-- money on the other. Whichever one the front desk opened, something was
-- missing - which is what they reported as photos "disappearing".
--
--   8d6be5ca  phone 9380426132, dob 1989-07-02, Chicmangalore, Skin Tag
--             removal. 3 photos, 1 procedure, 1 prescription. 11:15 appt.
--   a86a3795  phone "02/07/1989" - that same date of birth typed into the
--             phone box - and no dob at all. 1 invoice (Rs 2,500). 11:20 appt.
--
-- The mis-keyed phone is what makes it certain they are the same person, and
-- it is also how the duplicate came to exist: the second record was started
-- because a search for the number found nothing.
--
-- 8d6be5ca survives. It is better on every field that differs, and the two
-- junk values on the other record (the phone and gdvc@gmail.com) are not
-- discarded - they stay on it, marked Inactive rather than deleted, which is
-- what the app's own merge does (DuplicateResolveDialog.tsx).
--
-- The duplicate holds exactly two rows. That is not an assumption: it was
-- counted across all 24 tables carrying a foreign key to patients, not just
-- the seven the in-app merge knows about. Every step below is guarded, so
-- running this again, or after someone has merged by hand, changes nothing.
do $$
declare
  v_keep uuid := '8d6be5ca-ec53-4268-a9f6-24a8764457e5';
  v_drop uuid := 'a86a3795-d830-402b-9cad-6c36bedb4d4f';
  n_appt int;
  n_inv  int;
  n_left int;
begin
  if not exists (select 1 from public.patients where id = v_keep) then
    raise notice 'Adarsh % is not here - nothing merged', v_keep;
    return;
  end if;
  if not exists (select 1 from public.patients where id = v_drop) then
    raise notice 'Duplicate Adarsh % is not here - nothing to merge', v_drop;
    return;
  end if;

  update public.appointments set patient_id = v_keep where patient_id = v_drop;
  get diagnostics n_appt = row_count;

  update public.invoices set patient_id = v_keep where patient_id = v_drop;
  get diagnostics n_inv = row_count;

  -- Deactivated, not deleted. The row and its history stay readable.
  update public.patients set status = 'Inactive' where id = v_drop and status <> 'Inactive';

  -- Prove nothing was left behind before declaring this done. Anything still
  -- pointing at the dropped record means a table this merge did not know
  -- about, and that is worth failing loudly for rather than discovering later.
  select (select count(*) from public.appointments            where patient_id = v_drop)
       + (select count(*) from public.invoices                where patient_id = v_drop)
       + (select count(*) from public.procedures              where patient_id = v_drop)
       + (select count(*) from public.patient_photos          where patient_id = v_drop)
       + (select count(*) from public.survey_responses        where patient_id = v_drop)
       + (select count(*) from public.pharma_bills            where patient_id = v_drop)
       + (select count(*) from public.procedure_attachments   where patient_id = v_drop)
       + (select count(*) from public.whatsapp_conversations  where patient_id = v_drop)
       + (select count(*) from public.whatsapp_delivery_log   where patient_id = v_drop)
       + (select count(*) from public.ai_repository           where patient_id = v_drop)
       + (select count(*) from public.portal_orders           where patient_id = v_drop)
       + (select count(*) from public.portal_sessions         where patient_id = v_drop)
       + (select count(*) from public.patient_portal_tokens   where patient_id = v_drop)
       + (select count(*) from public.patient_portal_otps     where patient_id = v_drop)
       + (select count(*) from public.patient_pharma_requests where patient_id = v_drop)
       + (select count(*) from public.cart_items              where patient_id = v_drop)
       + (select count(*) from public.patient_campaigns       where patient_id = v_drop)
       + (select count(*) from public.bolna_booking_logs      where patient_id = v_drop)
       + (select count(*) from public.comms_journey_enrollments where patient_id = v_drop)
       + (select count(*) from public.comms_journey_message_log where patient_id = v_drop)
       + (select count(*) from public.comms_email_recipients  where patient_id = v_drop)
       + (select count(*) from public.patient_family_members  where patient_id = v_drop)
       + (select count(*) from public.patient_family_members  where related_patient_id = v_drop)
       + (select count(*) from public.leads                   where converted_patient_id = v_drop)
    into n_left;

  if n_left > 0 then
    raise exception 'Merge incomplete: % row(s) still point at the duplicate Adarsh % - nothing has been changed', n_left, v_drop;
  end if;

  raise notice 'Adarsh merged: % appointment(s) and % invoice(s) moved to %', n_appt, n_inv, v_keep;
end $$;
