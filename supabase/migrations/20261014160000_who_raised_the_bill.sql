-- Who at the front desk raised a bill.
--
-- The clinic has three people doing the billing and no way to tell afterwards
-- which of them made a given invoice. The app's own user is not the answer:
-- they share a machine and a login, so every bill already reads as the same
-- person.
--
-- It is for the clinic's own eyes. The invoice the patient receives does not
-- carry it, and the PDF is not touched.

alter table public.invoices add column if not exists billed_by text;

comment on column public.invoices.billed_by is
  'Front desk staff member who raised this bill. Internal only - never printed on the invoice or its PDF.';
