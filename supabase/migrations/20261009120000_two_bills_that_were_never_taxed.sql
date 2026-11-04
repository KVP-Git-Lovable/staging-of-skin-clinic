-- B-49050 and B-49052 showed GST in this app and none in Salesforce.
--
-- The clinic was right. Salesforce stages its own line items into
-- sf_billing_line_items verbatim, and for both bills they record:
--
--   B-49050  Hormonal Hirsutism (face maintenance - MEDICAL TREATMENT)
--            Rs 2,940, rate 0, tax 0
--   B-49052  Eczema(Medical Treatment)
--            Rs 1,000, rate 0, tax 0
--
-- Both are medical treatments, which are exempt. This app had them at 5% on
-- HSN 999722, the cosmetic code: Rs 140 and Rs 47.62.
--
-- It is only these two. Of 46,925 imported bills, 46,923 already agreed with
-- their Salesforce line items to the paisa. The cause is in the importer:
-- it read the GST__c rate off the Billing__c header and worked the tax out
-- from it, deliberately ignoring Total_Tax_Applicable__c on the stated
-- grounds that Salesforce "doesn't always populate" it. On these two the
-- header said 5% while every line said 0. The second figure is the giveaway -
-- Rs 47.619047619047706 is 1000 - 1000/1.05, a repeating decimal nobody
-- levied. billingTax.ts now takes the recorded amount over the rate.
--
-- The total and the paid amount do not move: Rs 2,940 and Rs 1,000 are what
-- the patient paid either way. Only the split changes - the whole amount is
-- the service fee, the tax heads are nil, and the HSN becomes 999319.
--
-- Applied to the live database on 9 October. Both rows are in
-- invoice_tax_backup_20261009 exactly as they stood, and both changes are in
-- invoice_tax_corrections with the reason. Afterwards all 46,925 imported
-- bills reconcile with Salesforce.

CREATE TABLE IF NOT EXISTS public.invoice_tax_backup_20261009 (
  id uuid, invoice_number text, total_amount numeric, tax_amount numeric,
  cgst_amount numeric, sgst_amount numeric, igst_amount numeric, tax_rate numeric,
  line_items jsonb, captured_at timestamptz DEFAULT now()
);
ALTER TABLE public.invoice_tax_backup_20261009 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invoice_tax_corrections (
  invoice_id uuid NOT NULL,
  invoice_number text,
  was_tax numeric,
  now_tax numeric,
  reason text,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, corrected_at)
);
ALTER TABLE public.invoice_tax_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_tax_corrections FROM anon, authenticated;

COMMENT ON TABLE public.invoice_tax_corrections IS
  'Every invoice whose tax this app has changed, with what it said before. '
  'A GST figure on an issued bill has to be readable back one bill at a time.';

-- 1. What they said before -----------------------------------------------------

INSERT INTO public.invoice_tax_backup_20261009
  (id, invoice_number, total_amount, tax_amount, cgst_amount, sgst_amount, igst_amount, tax_rate, line_items)
SELECT i.id, i.invoice_number, i.total_amount, i.tax_amount, i.cgst_amount, i.sgst_amount,
       i.igst_amount, i.tax_rate, i.line_items
  FROM public.invoices i
 WHERE i.invoice_number IN ('B-49050','B-49052')
   AND NOT EXISTS (SELECT 1 FROM public.invoice_tax_backup_20261009 b WHERE b.id = i.id);

-- 2. The correction, logged before it is made ----------------------------------

INSERT INTO public.invoice_tax_corrections (invoice_id, invoice_number, was_tax, now_tax, reason)
SELECT id, invoice_number, tax_amount, 0,
       'Salesforce''s own line items record rate 0 and tax 0 on this medical treatment; the importer derived 5% from the bill header'
  FROM public.invoices
 WHERE invoice_number IN ('B-49050','B-49052')
   AND coalesce(tax_amount, 0) <> 0
ON CONFLICT DO NOTHING;

UPDATE public.invoices i
   SET tax_amount = 0, cgst_amount = 0, sgst_amount = 0, igst_amount = 0, tax_rate = 0,
       line_items = (
         SELECT jsonb_agg(
                  (e - 'gst' - 'hsn')
                  || jsonb_build_object('gst', 0, 'hsn', '999319', 'price', i.total_amount)
                )
           FROM jsonb_array_elements(i.line_items) e
       )
 WHERE i.invoice_number IN ('B-49050','B-49052')
   AND coalesce(i.tax_amount, 0) <> 0;

-- Reversible in one statement:
--
--   UPDATE public.invoices i
--      SET tax_amount = b.tax_amount, cgst_amount = b.cgst_amount,
--          sgst_amount = b.sgst_amount, igst_amount = b.igst_amount,
--          tax_rate = b.tax_rate, line_items = b.line_items
--     FROM public.invoice_tax_backup_20261009 b WHERE b.id = i.id;
