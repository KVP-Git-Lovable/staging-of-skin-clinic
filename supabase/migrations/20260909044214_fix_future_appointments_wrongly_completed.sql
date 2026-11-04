-- Two related bugs let a future-dated appointment end up on a terminal
-- status ("Completed"/"No Show") it hasn't earned yet:
--
-- 1. complete_appointment_on_invoice_paid (added in
--    20260908124204_auto_complete_appointment_on_invoice_paid.sql) flips an
--    appointment to Completed whenever its linked invoice becomes Paid,
--    without checking whether the appointment's start_time is even in the
--    past - an advance/installment payment on a future visit (or a
--    Salesforce-imported "historical/paid" billing linked to the wrong
--    appointment) could force-complete something that hasn't happened yet.
-- 2. sf-import-clinical's status mapping (fixed separately in the edge
--    function) mismapped Salesforce's "Confirmed" straight to "Completed"
--    with no date check at all, and defaulted unmapped statuses to
--    "Completed" too - this is what actually produced the future-dated
--    "Completed" rows a user reported seeing.
--
-- This migration closes path #1 going forward and corrects existing rows
-- already wrongly stamped by either path.

CREATE OR REPLACE FUNCTION public.complete_appointment_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'Paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.appointments
    SET status = 'Completed'
    WHERE id = NEW.appointment_id
      AND status NOT IN ('Cancelled', 'No Show', 'Completed')
      AND start_time <= now();
  END IF;
  RETURN NEW;
END;
$$;

-- Data correction: a future appointment sitting on a terminal status is
-- definitionally wrong regardless of how it got there, so this isn't
-- scoped to Salesforce-sourced rows specifically. "Confirmed" is the
-- closest manual status to what these appointments actually are: booked,
-- not yet occurred.
UPDATE public.appointments
SET status = 'Confirmed'
WHERE status IN ('Completed', 'No Show')
  AND start_time > now();
