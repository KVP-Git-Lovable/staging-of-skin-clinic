CREATE TRIGGER validate_appointment_no_overlap_trigger
BEFORE INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.validate_appointment_no_overlap();