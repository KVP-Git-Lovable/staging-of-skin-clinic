-- One bill that never reached its appointment
--
-- Spoorthi's 24 September visit read "No bill" although a Rs 600 UPI bill had
-- been taken. The bill was real and showed in the appointment's own Billing
-- tab - but that tab lists by `patient_id`, so it proves nothing about the
-- link. The appointments list reads `appointment_id`, and on INV-788112 it was
-- null, because the bill was raised from the Billing page rather than from the
-- appointment's "New Bill" button, and only that button passed an appointment
-- through.
--
-- Safe to attribute: one patient, one appointment that day, and the doctor on
-- the bill is the doctor on the appointment. It was the only unlinked invoice
-- in the table - 46,941 of 46,942 already carried one.
--
-- The hole itself is closed in the application: the create form now suggests
-- the visit and shows it for staff to confirm (src/lib/appointmentForInvoice.ts).

update public.invoices
set appointment_id = '02259b2a-e121-40f8-a50d-c275d30b09a0'
where id = 'd6d43dfd-239d-449a-83ab-17eaf4ec5c85'
  and appointment_id is null;
