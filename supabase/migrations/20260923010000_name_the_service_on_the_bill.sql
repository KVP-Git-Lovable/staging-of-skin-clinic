-- Put the service that was performed on the bill line, instead of "Service".
--
-- 30,816 invoices carry the literal placeholder services = {'Service'}, written
-- by an early import when Billing__c named no Procedure_Type. This morning's
-- line-items rebuild copied it faithfully into line_items, so a printed bill
-- reads "Service" where the treatment should be - and where it does not, it has
-- been showing the raw Investigation text, which is the visit's notes rather
-- than what was done.
--
-- The clinic's rule: show the service only where a service was actually
-- performed. Measured against the linked appointment:
--
--   23,382  the visit records a real service  -> use that name
--    7,434  the visit is a consultation       -> "Consultation"
--
-- appointments.service is the resolved service the importer already derives
-- (serviceName.ts), not the raw Investigation text, so this is the service name
-- the rest of the app shows for that visit - the bill now agrees with it.
--
-- Amounts are untouched. Only the line's name and the services array change, so
-- no total, tax, HSN or paid figure moves.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_service_name_backup_20260923 (
  id uuid PRIMARY KEY,
  services text[],
  line_items jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE service_name_fix ON COMMIT DROP AS
SELECT i.id,
       CASE
         WHEN a.service IS NOT NULL AND btrim(a.service) <> '' AND a.service <> 'Consultation'
           THEN a.service
         ELSE 'Consultation'
       END AS new_name
  FROM public.invoices i
  JOIN public.appointments a ON a.id = i.appointment_id
 WHERE i.services = ARRAY['Service']::text[];

INSERT INTO public.invoice_service_name_backup_20260923 (id, services, line_items)
SELECT i.id, i.services, i.line_items
  FROM public.invoices i
  JOIN service_name_fix f ON f.id = i.id
    ON CONFLICT (id) DO NOTHING;

UPDATE public.invoices i
   SET services = ARRAY[f.new_name]::text[],
       line_items = CASE
         WHEN jsonb_typeof(i.line_items) = 'array' THEN (
           SELECT jsonb_agg(jsonb_set(e.item, '{name}', to_jsonb(f.new_name)) ORDER BY e.ord)
             FROM jsonb_array_elements(i.line_items) WITH ORDINALITY AS e(item, ord)
         )
         ELSE i.line_items
       END
  FROM service_name_fix f
 WHERE i.id = f.id;

COMMIT;
