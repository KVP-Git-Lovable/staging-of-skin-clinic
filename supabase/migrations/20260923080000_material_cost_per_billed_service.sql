-- Material cost per billed service, for the reports only.
--
-- The clinic sets a material cost percentage against a service in the Service
-- Master and wants to deduct that cost per service or per doctor to see what a
-- service actually earned. It must never appear on an invoice or a printed
-- bill: it is an internal margin figure, not something a patient is charged or
-- shown. Nothing here writes to invoices, and generate-invoice-pdf does not
-- read it.
--
-- One row per billed service line, with the percentage that applies and the
-- money it comes to. Built here rather than in the report's own code so the
-- rule lives in one place, and so a report over six years of billing does not
-- pull every invoice into the browser to work it out.
--
-- Which percentage applies, in order:
--
--   1. the one recorded on the visit's own service line
--      (procedure_services.material_percent) - a visit can use more material
--      than the standard rate assumes, and a custom service has no master row;
--   2. otherwise the Service Master's rate, matched on name;
--   3. otherwise zero.
--
-- Taking the visit's own figure first means correcting a rate in the Service
-- Master later does not rewrite what a visit already cost.
--
-- Written with LEFT JOIN and LEFT JOIN LATERAL ... LIMIT 1 rather than
-- correlated subqueries. The subquery form ran the procedures lookup once per
-- billed line and timed out on a 30-day range; this returns immediately. The
-- LIMIT 1 also stops a visit with several matching service lines multiplying
-- one billed line into several rows and overstating the cost.
--
-- Both name lookups normalise the same way as services_name_normalized_unique_idx
-- (lower + btrim + collapse whitespace) so they can use that index, and the
-- companion index on procedure_services matches it.
--
-- The base is line_items.price, the pre-tax value of the line - the same base
-- the Billing screen's internal material panel uses. Material is a share of
-- what the work was worth, not of the tax collected on it.
--
-- Cancelled bills are excluded: that money was never taken.
--
-- KNOWN LIMIT, worth stating: the percentage is matched by service NAME, and
-- of 1,472 distinct service names billed in the last year only 10 match the
-- Service Master. Salesforce-era bills carry names like "Hydrasignature 3rx
-- (COSMETIC TREATMENT)" that do not correspond to the 57 master services, so
-- this reports almost nothing for historical billing. It fills in for work
-- billed from the master, and for any visit where the percentage is typed on
-- the service line itself.
--
-- security_invoker so the caller's own row-level permissions apply; this view
-- must not become a way around them.

CREATE INDEX IF NOT EXISTS idx_procedures_appointment_id
  ON public.procedures (appointment_id);

CREATE INDEX IF NOT EXISTS idx_procedure_services_name_norm
  ON public.procedure_services (lower(regexp_replace(btrim(service_name), '\s+', ' ', 'g')));

CREATE OR REPLACE VIEW public.material_cost_lines
WITH (security_invoker = true) AS
SELECT
  i.id AS invoice_id,
  i.invoice_number,
  i.created_at,
  i.patient_name,
  i.patient_id,
  i.doctor_id,
  i.appointment_id,
  l->>'name'             AS service_name,
  (l->>'price')::numeric AS service_amount,
  COALESCE(ov.pct, s.material_percent, 0)::numeric AS material_percent,
  round((l->>'price')::numeric * COALESCE(ov.pct, s.material_percent, 0)::numeric / 100.0, 2) AS material_cost
FROM public.invoices i
CROSS JOIN LATERAL jsonb_array_elements(i.line_items) l
LEFT JOIN public.services s
  ON lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'))
   = lower(regexp_replace(btrim(l->>'name'), '\s+', ' ', 'g'))
LEFT JOIN LATERAL (
  SELECT ps.material_percent AS pct
  FROM public.procedure_services ps
  JOIN public.procedures p ON p.id = ps.procedure_id
  WHERE p.appointment_id = i.appointment_id
    AND lower(regexp_replace(btrim(ps.service_name), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(l->>'name'), '\s+', ' ', 'g'))
    AND ps.material_percent IS NOT NULL
  LIMIT 1
) ov ON true
WHERE i.status IS DISTINCT FROM 'Cancelled';

COMMENT ON VIEW public.material_cost_lines IS
  'One row per billed service line with its material cost percentage and value. '
  'Internal margin figure for reports only - never shown on an invoice. The '
  'percentage recorded on the visit wins over the Service Master rate.';
