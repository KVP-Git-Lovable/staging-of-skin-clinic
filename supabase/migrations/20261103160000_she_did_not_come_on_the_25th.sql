-- Dia K did not attend on 25 September 2026.
--
-- The visit read "Billed" on her Appts tab. It was never billed: the badge
-- was derived from the appointment's status, and the status said "Completed".
-- That word did not come from this clinic - the row carries
-- sf_id a08OW000012cobgYAA, and sf-import-clinical defaults any unmapped
-- Salesforce status on a past-dated appointment to "Completed" with no check
-- that anything actually happened.
--
-- The clinic confirms she did not come, and the record agrees: this visit has
-- no invoice, no procedure, no prescription, no photo and no survey response.
-- Nothing at all is dated 25 Sep 2026 for her.
--
-- So the booking stands and the attendance is corrected to "No Show". Nothing
-- is deleted. What changes:
--   - her Appts tab stops calling it a completed visit
--   - her header count drops from 4 visits to 3 (patient-engagement counts any
--     past appointment that is not Cancelled or No Show as attended)
--   - her engagement score stops being built on a visit that never happened
--
-- Her other four appointments are untouched. Two of them (2 Sep, 13 Aug) are
-- genuine paid visits still sitting on "Confirmed" because the completing
-- trigger skips an appointment whose start time has not yet arrived; those are
-- a separate matter and are deliberately left alone, since the badge now reads
-- their invoices directly.
--
-- Safe to re-run: it does nothing once the status is no longer "Completed",
-- and it refuses to act if any evidence of the visit has appeared since.

do $$
declare
  v_appt uuid := 'c9a52bd9-0046-4508-ac73-9c895755acc0';
  v_pat  uuid := '97c6bd7a-f43b-4b23-8b76-8a74c84d1201';
  n_evidence int;
  n_rows int;
begin
  if not exists (
    select 1 from public.appointments
     where id = v_appt and patient_id = v_pat and status = 'Completed'
  ) then
    raise notice 'The 25 Sep visit is not an unmodified Completed row - nothing to do';
    return;
  end if;

  -- The whole justification is that nothing happened. Checked again here
  -- rather than trusted from when this was written: if a bill or a procedure
  -- has been recorded against the visit since, somebody knows something this
  -- migration does not, and it must not overrule them.
  select (select count(*) from public.invoices        where appointment_id = v_appt)
       + (select count(*) from public.procedures      where appointment_id = v_appt)
       + (select count(*) from public.patient_photos  where appointment_id = v_appt)
       + (select count(*) from public.survey_responses where appointment_id = v_appt)
    into n_evidence;

  if n_evidence > 0 then
    raise exception
      'The 25 Sep visit now has % record(s) against it - it may have happened after all, so nothing has been changed',
      n_evidence;
  end if;

  update public.appointments
     set status = 'No Show', updated_at = now()
   where id = v_appt and patient_id = v_pat and status = 'Completed';
  get diagnostics n_rows = row_count;

  raise notice 'Marked % appointment as No Show (Dia K, 25 Sep 2026)', n_rows;
end $$;
