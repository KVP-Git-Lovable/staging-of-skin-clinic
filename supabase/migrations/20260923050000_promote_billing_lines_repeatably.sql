-- Promoting the real bill lines, repeatably.
--
-- 20260923040000 put Salesforce's per-line billing data onto the invoices as a
-- one-shot UPDATE, which corrected every bill staged at that moment and nothing
-- staged afterwards. Staging arrives continuously - the patient sync stages the
-- lines for whoever it reaches, and a bulk backfill of Billing_Line_Item__c
-- will pour in the rest - so the promotion has to be runnable again and again
-- rather than once.
--
-- Same statement as that migration, with two additions:
--
--   * a _batch limit, because 46,913 invoices will not update in one statement
--     inside the client timeout; and
--   * an idempotence guard, so re-running only touches invoices that are not
--     already correct and a second pass over settled data returns 0.
--
-- Call it until it returns 0.
--
-- The reconciliation gate is unchanged and is the whole safety of this: an
-- invoice is rewritten only when its Salesforce lines add up to what the
-- patient was actually billed, to within a paisa. A bill that does not
-- reconcile is left exactly as it is rather than half-rewritten, and shows up
-- in the verification query as a genuine discrepancy to look at. It has held on
-- 1,290 of 1,290 bills so far.
--
-- total_amount is never written here. What each patient was billed does not
-- change; only how that total is broken into lines and split between fee and
-- tax.
--
-- SECURITY DEFINER with a pinned search_path: it is called by the service role
-- and by scheduled jobs, never by a client, and invoices is RLS-protected.

CREATE OR REPLACE FUNCTION public.promote_billing_lines(_batch int DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _done integer;
BEGIN
  WITH src AS (
    SELECT l.billing_sf_id,
           jsonb_agg(jsonb_build_object(
             'name',  COALESCE(NULLIF(trim(l.service_name),''), NULLIF(trim(l.product_name),''), 'Consultation'),
             'qty',   COALESCE(l.quantity, 1),
             -- Salesforce's Total_Price__c is tax-INCLUSIVE; line_items.price is
             -- the pre-tax base the app and the PDF add GST to.
             'price', round((l.total_price / (1 + COALESCE(l.gst_rate,0)/100))::numeric, 2),
             'gst',   COALESCE(l.gst_rate,0),
             -- Per line, not per bill: a bill can hold an exempt consultation
             -- beside a taxed treatment, and a single rate cannot say that.
             -- Mirrors sf-import-clinical/hsnForRate.ts across the 2025-09-21
             -- changeover.
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
           SUM(l.total_price)            AS total,
           COUNT(*)                      AS n
    FROM sf_billing_line_items l
    JOIN invoices i ON i.sf_id = l.billing_sf_id
    GROUP BY l.billing_sf_id, i.created_at
  ),
  pending AS (
    SELECT s.* FROM src s JOIN invoices i ON i.sf_id = s.billing_sf_id
    WHERE abs(s.total - i.total_amount) <= 0.01
      AND (i.line_items IS DISTINCT FROM s.lines
           OR abs(i.tax_amount - s.tax) > 0.005)
    LIMIT _batch
  ),
  upd AS (
    UPDATE invoices i SET
      line_items  = p.lines,
      services    = p.svc,
      tax_rate    = p.rate,
      tax_amount  = p.tax,
      cgst_amount = p.tax / 2,
      sgst_amount = p.tax / 2,
      updated_at  = i.updated_at
    FROM pending p
    WHERE i.sf_id = p.billing_sf_id
    RETURNING 1
  )
  SELECT count(*) INTO _done FROM upd;
  RETURN _done;
END;
$fn$;

COMMENT ON FUNCTION public.promote_billing_lines(int) IS
  'Rewrites invoices.line_items/services/tax from staged Billing_Line_Item__c '
  'rows, only where they reconcile to total_amount. Idempotent; call until it '
  'returns 0. Never writes total_amount.';
