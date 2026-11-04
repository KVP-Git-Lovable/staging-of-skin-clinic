-- A doctor's consultation carries no GST, but Salesforce sends 5% on these and
-- the import faithfully reproduced it. Remove the tax from consultation-only
-- invoices already imported.
--
-- SCOPE: FINANCIAL YEAR 2026-2027 ONLY - bills raised on or after 1 April 2026.
-- The mis-charged tax goes back to August 2021 (589 bills, Rs 1,32,712 of GST),
-- but the four earlier financial years are already filed with the tax
-- authorities and the clinic's decision is to leave them exactly as filed.
-- Only the current, unfiled year is corrected here.
--
-- AMOUNTS DO NOT CHANGE. total_amount and paid_amount are never written: the tax
-- was extracted from a tax-inclusive total (809.52 + 40.48 = 850), so the patient
-- paid ₹850 and still paid ₹850. Only the split disappears, and the line's price
-- becomes the full total.
--
-- ONLY consultation-only visits are touched. A visit that also had a procedure
-- ("New consult + RF + Excision") keeps whatever GST Salesforce recorded, which
-- is the clinic's rule: only the consultation itself is exempt.
--
-- The amount is NOT used to decide. In the clinic's own data "Old Consult" was
-- billed at 500 against an 850 consultation fee, while "New consult + RF +
-- Excision" was billed at exactly the 800 fee - matching on price would get both
-- wrong. The Investigation text is the only reliable signal.
--
-- is_pure_consultation() below mirrors isPureConsultation() in
-- supabase/functions/sf-import-clinical/consultation.ts - two copies of one
-- rule, which is the real hazard here. The TypeScript side is covered by
-- src/test/sfConsultation.test.ts against the clinic's 60 exported invoices in
-- src/test/fixtures/clinic-consultation-invoices.csv; this SQL was run over the
-- same 60 rows on Postgres 16 and agreed on every one (32 consultation-only,
-- 28 not). If you change one, change the other and re-check against that CSV.

CREATE OR REPLACE FUNCTION public.clean_investigation_text(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(coalesce(_text, ''), '\([^()]*\)', ' ', 'g'),
                 '\mlast session\s+on\M.*$', ' ', 'i'),
               '\?+', ' ', 'g'),
             '\s+', ' ', 'g')
         );
$$;

COMMENT ON FUNCTION public.clean_investigation_text(text) IS
  'Investigation text with the importer noise removed. Mirrors cleanInvestigationText() in sf-import-clinical/consultation.ts.';

CREATE OR REPLACE FUNCTION public.is_pure_consultation(_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cleaned AS (
    SELECT btrim(
             regexp_replace(
               regexp_replace(
                 regexp_replace(
                   regexp_replace(coalesce(_text, ''), '\([^()]*\)', ' ', 'g'),   -- drop asides incl. "(Dr. …)"
                   '\mlast session\s+on\M.*$', ' ', 'i'),                          -- drop the repeat trailer
                 '\?+', ' ', 'g'),
               '\s+', ' ', 'g')
           ) AS t
  ), parts AS (
    SELECT btrim(p) AS part FROM cleaned, unnest(string_to_array(cleaned.t, '+')) AS p
     WHERE btrim(p) <> ''
  )
  SELECT EXISTS (SELECT 1 FROM parts)
     AND NOT EXISTS (
       SELECT 1 FROM parts
        WHERE part !~* '^(?:(?:new|old|re)\s*)?consult(?:ation)?$'
          AND part !~* '^review$'
     );
$$;

COMMENT ON FUNCTION public.is_pure_consultation(text) IS
  'True when an Investigation text describes a consultation and nothing else. Mirrors isPureConsultation() in sf-import-clinical/consultation.ts.';

UPDATE public.invoices i
   SET tax_rate    = 0,
       tax_amount  = 0,
       cgst_amount = 0,
       sgst_amount = 0,
       igst_amount = 0,
       -- The line now carries the whole amount, with no GST. jsonb_array_length
       -- is used rather than count(*) OVER (): a window function cannot appear
       -- inside an aggregate.
       line_items  = CASE
         WHEN jsonb_typeof(i.line_items::jsonb) = 'array'
          AND jsonb_array_length(i.line_items::jsonb) > 0 THEN (
           SELECT jsonb_agg(
                    item || jsonb_build_object(
                      'gst', 0,
                      'price', round(i.total_amount / jsonb_array_length(i.line_items::jsonb), 2)
                    )
                  )
             FROM jsonb_array_elements(i.line_items::jsonb) AS item
         )
         ELSE i.line_items
       END
  FROM public.appointments a
 WHERE a.id = i.appointment_id
   AND i.sf_id IS NOT NULL
   -- Current financial year only. invoices.created_at is the Salesforce
   -- CreatedDate (sf-import-clinical writes created_at: b.CreatedDate), so this
   -- is the date the bill was actually raised, not the date it was imported.
   -- Read in IST, so a bill raised on the morning of 1 April in Mangalore is not
   -- dragged back into the previous financial year by UTC. No upper bound: one
   -- would silently skip bills imported after 31 March 2027 while the old
   -- importer was still deployed.
   AND (i.created_at AT TIME ZONE 'Asia/Kolkata') >= DATE '2026-04-01'
   AND COALESCE(i.tax_amount, 0) > 0
   AND public.is_pure_consultation(a.reason_for_consultation);

-- ---------------------------------------------------------------------------
-- Name the line by what was actually done.
--
-- The import stored the literal "Service" whenever Salesforce gave no procedure
-- type, and generate-invoice-pdf then swapped that placeholder for the linked
-- appointment's resolved service - nearly always "Consultation". So every bill
-- read "Consultation" and the front desk could not tell a laser session from a
-- review. Replace the placeholder with the Investigation text, cleaned the same
-- way the classifier cleans it, or with "Consultation" when that is what the
-- visit genuinely was.
--
-- Only the "Service" placeholder is replaced: a line Salesforce actually named
-- is left exactly as it is.
--
-- This one covers ALL history, unlike the tax fix above. It changes no amount
-- and no tax - it only names what was done - so there is nothing here that a
-- filed return could disagree with, and restricting it would leave older bills
-- unreadable at the front desk for no reason.

UPDATE public.invoices i
   SET line_items = (
         SELECT jsonb_agg(
                  CASE
                    WHEN item->>'name' = 'Service' THEN
                      item || jsonb_build_object('name',
                        CASE
                          WHEN public.is_pure_consultation(a.reason_for_consultation) THEN 'Consultation'
                          ELSE public.clean_investigation_text(a.reason_for_consultation)
                        END)
                    ELSE item
                  END
                )
           FROM jsonb_array_elements(i.line_items::jsonb) AS item
       )
  FROM public.appointments a
 WHERE a.id = i.appointment_id
   AND i.sf_id IS NOT NULL
   AND jsonb_typeof(i.line_items::jsonb) = 'array'
   AND jsonb_array_length(i.line_items::jsonb) > 0
   AND i.line_items::jsonb @> '[{"name":"Service"}]'::jsonb
   AND btrim(coalesce(public.clean_investigation_text(a.reason_for_consultation), '')) <> '';
