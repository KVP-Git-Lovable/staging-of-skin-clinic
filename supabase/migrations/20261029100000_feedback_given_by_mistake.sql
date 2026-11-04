-- Feedback given by mistake.
--
-- Shaida tapped NPS 1 and two stars on her 29 Oct visit without meaning to,
-- and the clinic wants to record the real answers. The row has to go first:
-- patient_feedback carries UNIQUE (appointment_id), so the mistaken row
-- actively blocks a second one for that visit. With it gone the Feedback tab
-- shows its blank form again and the front desk can enter the real scores.
--
-- patient_feedback is NOT one of the objects trash_allowed_object covers, so
-- there is no Trash to pull this back out of - a delete here is final. The row
-- is therefore copied first, the way the repo has handled this before
-- (whatsapp_delivery_log_backup_20261014, invoice_name_backup_20260923 and
-- others). Nothing is actually lost; it just stops counting.
--
-- Every step is guarded, and the delete cannot run unless the copy is already
-- safely in the backup table. This re-runs on every environment, so on one
-- where the row never existed it does nothing and says so.

create table if not exists public.patient_feedback_backup_20261029
  (like public.patient_feedback including defaults);

comment on table public.patient_feedback_backup_20261029 is
  'Feedback removed on 29 Oct 2026 at the clinic''s request, kept because '
  'patient_feedback has no Trash. Safe to drop once they confirm the '
  'replacement feedback was recorded.';

do $$
declare
  v_feedback uuid := '6046199c-13b7-4d47-837b-a784481b2b6d';
  v_appt     uuid := '6133d975-7fa8-4079-948a-94631da69d8a';
  v_saved    int;
  v_removed  int;
begin
  if not exists (select 1 from public.patient_feedback where id = v_feedback) then
    raise notice 'Feedback % is already gone - nothing to remove', v_feedback;
    return;
  end if;

  insert into public.patient_feedback_backup_20261029
  select f.* from public.patient_feedback f
   where f.id = v_feedback
     and not exists (
       select 1 from public.patient_feedback_backup_20261029 b where b.id = f.id
     );

  -- Only delete what is demonstrably copied. If the insert above did nothing,
  -- this finds no backup row and the row stays where it is.
  select count(*) into v_saved
    from public.patient_feedback_backup_20261029 where id = v_feedback;

  if v_saved <> 1 then
    raise exception 'Feedback % was not backed up (% copies found) - nothing has been deleted',
      v_feedback, v_saved;
  end if;

  delete from public.patient_feedback
   where id = v_feedback and appointment_id = v_appt;
  get diagnostics v_removed = row_count;

  raise notice 'Removed % mistaken feedback row for appointment %, backup holds % copy',
    v_removed, v_appt, v_saved;
end $$;
