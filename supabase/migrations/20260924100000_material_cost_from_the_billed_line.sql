-- Let a billed line carry its own material cost percentage.
--
-- The view resolved the percentage from the visit's service line, then the
-- Service Master, then nothing. Both of those are out of reach for an invoice
-- raised straight from Billing: there is no visit line to inherit from, and a
-- one-off service typed in by hand has no master entry either. Since the
-- report matches a billed line to the master BY NAME, and of 1,472 distinct
-- service names billed in the last year only 10 match, that covered very
-- little of what the clinic actually bills.
--
-- So the line itself is now the first place looked. Order: the billed line,
-- then the visit's override, then the master default, then zero. An explicit
-- 0 on the line is honoured - it means "no material cost here", which is not
-- the same as leaving it blank, and Billing omits the key entirely when the
-- box is left empty so the two stay distinguishable.
--
-- Nothing else about the view changes, and security_invoker stays on: without
-- it this view would hand every doctor every doctor's billing, which the
-- restrictive policies on invoices exist to prevent.
--
-- Checked against the live database before and after: 4,062 rows and 127.62
-- of material cost since 2026-06-01, unchanged either side of the swap.

CREATE OR REPLACE VIEW public.material_cost_lines
WITH (security_invoker = true) AS
SELECT i.id AS invoice_id,
    i.invoice_number,
    i.created_at,
    i.patient_name,
    i.patient_id,
    i.doctor_id,
    i.appointment_id,
    l.value ->> 'name'::text AS service_name,
    (l.value ->> 'price'::text)::numeric AS service_amount,
    COALESCE((l.value ->> 'material_percent'::text)::numeric, ov.pct, s.material_percent, 0::numeric) AS material_percent,
    round(((l.value ->> 'price'::text)::numeric) * COALESCE((l.value ->> 'material_percent'::text)::numeric, ov.pct, s.material_percent, 0::numeric) / 100.0, 2) AS material_cost
   FROM invoices i
     CROSS JOIN LATERAL jsonb_array_elements(i.line_items) l(value)
     LEFT JOIN services s ON lower(regexp_replace(btrim(s.name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim(l.value ->> 'name'::text), '\s+'::text, ' '::text, 'g'::text))
     LEFT JOIN LATERAL ( SELECT ps.material_percent AS pct
           FROM procedure_services ps
             JOIN procedures p ON p.id = ps.procedure_id
          WHERE p.appointment_id = i.appointment_id AND lower(regexp_replace(btrim(ps.service_name), '\s+'::text, ' '::text, 'g'::text)) = lower(regexp_replace(btrim(l.value ->> 'name'::text), '\s+'::text, ' '::text, 'g'::text)) AND ps.material_percent IS NOT NULL
         LIMIT 1) ov ON true
  WHERE i.status IS DISTINCT FROM 'Cancelled'::text;
