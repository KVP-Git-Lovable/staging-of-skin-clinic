-- Take back the GST this app invented on 27,208 bills.
--
-- WHAT WENT WRONG
--
-- On 2026-09-22 the invoice breakdown was rebuilt. Billing__c carries a rate in
-- GST__c and an amount in Total_Tax_Applicable__c, and that rebuild chose the
-- rate, reasoning in its own comment that Salesforce "doesn't always populate
-- Total_Tax_Applicable__c even when GST__c (the rate) is set", so subtracting a
-- missing tax figure would leave the line at the full total and double-count
-- later.
--
-- The zeros were not missing. They were real. Bills with GST__c = 18 and
-- Total_Tax_Applicable__c = 0 are bills on which no GST was charged, and
-- treating the 0 as absent put tax on all of them.
--
-- Importing Billing_Line_Item__c settled it from a source neither side had
-- seen. Across the bills staged so far, on every one of them:
--
--   * the pre-rebuild value matched Salesforce's own per-line Tax_Amount__c:  152/152
--   * the post-rebuild value matched it:                                        0/152
--
-- Two independent Salesforce sources - the bill's own tax amount and the sum of
-- its line items' tax - agree with each other and disagree with what this app
-- computed. Where a bill genuinely is taxed, all three agree exactly: B-29686
-- is 12,000 + 18% = 14,160 in Salesforce, in the backup and here.
--
-- Scale: 27,208 invoices, Rs 1,09,48,294.57 of GST that was never charged.
--
-- WHAT THIS DOES
--
-- Restores tax_rate, tax_amount, cgst_amount and sgst_amount to the
-- pre-rebuild values captured in invoice_breakdown_backup_20260922, and puts
-- each line's price back to the full amount with the exempt HSN for its era
-- (9993 before the 2025-09-21 changeover, 999319 after) - because an HSN
-- derived from a wrong rate is a wrong HSN.
--
-- total_amount is NOT touched, here or anywhere: what each patient was billed
-- was always right. What was wrong is how that total was split between fee and
-- tax on the printed invoice. Verified afterwards: 0 invoices changed total.
--
-- The previous state is kept in full in invoice_tax_wrong_state_20260923, so
-- this is reversible.
--
-- Applied in batches of 5,000 against the live database.

UPDATE public.invoices i SET
  tax_rate    = 0,
  tax_amount  = 0,
  cgst_amount = 0,
  sgst_amount = 0,
  line_items  = (
    SELECT jsonb_agg(jsonb_build_object(
      'name',  l->>'name',
      'qty',   COALESCE(l->'qty', '1'::jsonb),
      'price', i.total_amount,
      'gst',   0,
      'hsn',   CASE WHEN i.created_at < '2025-09-21' THEN '9993' ELSE '999319' END))
    FROM jsonb_array_elements(i.line_items) l),
  updated_at  = i.updated_at
FROM public.invoice_breakdown_backup_20260922 b
WHERE b.id = i.id
  AND COALESCE(b.tax_amount, 0) = 0
  AND i.tax_amount > 0;
