-- Clinic decision: the overlap block is too rigid for how the front desk books
-- (double-booking a doctor's slot is sometimes intentional). Removed at the
-- owner's request. The booking screen's soft warning stays; only the hard
-- database block goes.
DROP TRIGGER IF EXISTS validate_appointment_no_overlap_trigger ON public.appointments;