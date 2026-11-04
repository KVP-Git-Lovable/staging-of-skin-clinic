-- Put the real Salesforce bill lines onto the invoices.
--
-- Until now every invoice in this database held exactly one line item - all
-- 46,911 of them, not one multi-line bill anywhere - because a bill's services
-- were only ever collapsed into a single synthesised row whose price was the
-- total and whose name was guessed from the visit.
--
-- Billing_Line_Item__c has the real breakdown, and it reconciles: on every bill
-- staged, SUM(Total_Price__c) equals invoices.total_amount to the paisa. That
-- reconciliation is the gate below - a bill whose lines do not add up to what
-- it was billed is left exactly as it is rather than half-rewritten.
--
-- What this fixes, taking two real bills:
--
--   B-17669  showed  "Consultation  Rs 14,935"
--            really  Consultation Rs 400 + Laser toning 6rx Rs 14,535
--
--   B-39570  showed  "Old Consult +1rx Underarms HR + 1rx Exion Neck  Rs 62,555"
--            really  Consultation Rs 500 @0%
--                  + Underarms hair reduction 8rx Rs 19,530 @5%
--                  + Exion Neck 6rx Rs 42,525 @5%
--
-- B-39570 is why this matters beyond names: one bill, two GST rates. A single
-- rate per bill cannot represent an exempt consultation sitting next to taxed
-- treatment, so the tax and the HSN were both wrong on every mixed bill. Per
-- line, each carries its own rate and its own HSN.
--
-- Salesforce's Total_Price__c is tax-INCLUSIVE; line_items.price is the pre-tax
-- base the app and the PDF add GST to. Hence the division rather than a copy.
--
-- Names come from Service1__c, falling back to Products__c - the service the
-- patient actually had, which is what the clinic asked to see on the invoice
-- instead of the visit's investigation text.

WITH src AS (
  SELECT l.billing_sf_id,
         jsonb_agg(jsonb_build_object(
           'name',  COALESCE(NULLIF(trim(l.service_name),''), NULLIF(trim(l.product_name),''), 'Consultation'),
           'qty',   COALESCE(l.quantity, 1),
           'price', round((l.total_price / (1 + COALESCE(l.gst_rate,0)/100))::numeric, 2),
           'gst',   COALESCE(l.gst_rate,0),
           'hsn',   CASE WHEN COALESCE(l.gst_rate,0) = 0
                         THEN CASE WHEN i.created_at < '2025-09-21' THEN '9993' ELSE '999319' END
                         WHEN i.created_at < '2025-09-21'
                         THEN CASE WHEN l.gst_rate = 18 THEN '9997' ELSE '' END
                         ELSE CASE WHEN l.gst_rate = 5 THEN '999722' ELSE '' END END
         ) ORDER BY l.sf_created_at, l.sf_id) AS lines,
         array_agg(COALESCE(NULLIF(trim(l.service_name),''), NULLIF(trim(l.product_name),''), 'Consultation')
                   ORDER BY l.sf_created_at, l.sf_id) AS svc,
         SUM(COALESCE(l.tax_amount,0)) AS tax,
         MAX(COALESCE(l.gst_rate,0))   AS rate,
         SUM(l.total_price)            AS total
  FROM public.sf_billing_line_items l
  JOIN public.invoices i ON i.sf_id = l.billing_sf_id
  GROUP BY l.billing_sf_id, i.created_at
)
UPDATE public.invoices i SET
  line_items  = s.lines,
  services    = s.svc,
  tax_rate    = s.rate,
  tax_amount  = s.tax,
  cgst_amount = s.tax / 2,
  sgst_amount = s.tax / 2,
  updated_at  = i.updated_at
FROM src s
WHERE i.sf_id = s.billing_sf_id
  -- The gate: promote only what reconciles against what the patient was billed.
  AND abs(s.total - i.total_amount) <= 0.01;
