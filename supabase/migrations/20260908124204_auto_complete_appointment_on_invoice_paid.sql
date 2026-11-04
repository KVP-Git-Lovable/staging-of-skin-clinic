-- When an invoice's linked appointment gets fully paid, that specific visit
-- should automatically show as "Completed" - previously nothing in the live
-- app ever set this (older appointments showing Completed were only
-- Salesforce-imported rows arriving with that status already baked in).
-- A DB trigger catches every path an invoice can become Paid through
-- (the Billing UI's several mutations, WhatsApp payment webhook, etc.) in
-- one place, rather than duplicating this check into each of them.
--
-- Only fires forward (Pending/Partial -> Paid): never overrides an
-- appointment a staff member has since marked Cancelled or No Show, and is
-- a no-op if the appointment is already Completed.
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
      AND status NOT IN ('Cancelled', 'No Show', 'Completed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS complete_appointment_on_invoice_paid ON public.invoices;
CREATE TRIGGER complete_appointment_on_invoice_paid
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.complete_appointment_on_invoice_paid();
