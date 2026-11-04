-- Appointments may overlap
--
-- Booking refused a slot when the same doctor already had an appointment
-- covering any part of it: "This doctor already has an appointment from X to Y.
-- Please pick a different slot."
--
-- That is not how this clinic runs. A doctor starts a laser session, sees a
-- consultation while it runs, and comes back. The clinic's own data already
-- says so: 352 pairs of overlapping appointments exist in September alone,
-- because the check exempted rows imported from Salesforce while applying to
-- anything staff booked in the app. So the rule was never true of the clinic -
-- it only stopped them recording what they were already doing.
--
-- The function body is emptied rather than the trigger dropped. DROP TRIGGER
-- needs an ACCESS EXCLUSIVE lock on `appointments`, and the Salesforce sync
-- writes to that table continuously; the drop timed out twice waiting for it.
-- CREATE OR REPLACE FUNCTION takes no lock on the table, so this applies
-- immediately and safely on a live clinic.
--
-- To restore the rule, put the body back - it is preserved verbatim in the
-- comment below, and in migrations 20260427063556 and 20260901073023.
--
--   IF NEW.sf_id IS NOT NULL THEN RETURN NEW; END IF;
--   IF NEW.staff_id IS NULL THEN RETURN NEW; END IF;
--   IF NEW.status IN ('Cancelled', 'No-show') THEN RETURN NEW; END IF;
--   SELECT id, start_time, end_time, patient_name INTO conflict_row
--   FROM public.appointments
--   WHERE staff_id = NEW.staff_id
--     AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
--     AND sf_id IS NULL
--     AND status NOT IN ('Cancelled', 'No-show')
--     AND start_time < NEW.end_time
--     AND end_time > NEW.start_time
--   LIMIT 1;
--   IF FOUND THEN RAISE EXCEPTION '...' USING ERRCODE = 'check_violation'; END IF;

create or replace function public.validate_appointment_no_overlap()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Overlap checking is off at the clinic's request; see the migration header.
  return new;
end;
$function$;
