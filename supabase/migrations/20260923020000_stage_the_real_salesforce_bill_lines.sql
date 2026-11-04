-- The bill lines we never fetched.
--
-- Every invoice line in this app is synthesised. sf-import-clinical reads only
-- Billing__c, takes the bill total and splits it evenly across whatever
-- Procedure_Type__c text it finds, derives the pre-tax base by algebra and
-- guesses HSN from the rate. The importer says so itself:
--
--   "Billing__c has no per-line item breakdown (Procedure_Type__c etc. are
--    just names, no price/HSN)"
--
-- True of Billing__c. Untrue of its child object, Billing_Line_Item__c, which
-- nobody ever queried and which carries the real thing on every line:
-- Service1__c and Products__c (94% filled), Quantity__c, MRP_Per_Unit__c,
-- Total_Price__c, GST__c, Tax_Amount__c and CGST_SGST__c (100%).
--
-- This table holds those rows verbatim, exactly as Salesforce sends them. It
-- is deliberately a staging table and not a rewrite of invoices.line_items:
-- the raw lines land here first so their totals can be reconciled against
-- invoices.total_amount in SQL, and only what reconciles gets promoted. That
-- ordering is the whole point - 46,910 invoices of real clinical billing are
-- not something to overwrite on the strength of a field description.
--
-- Keeping the source rows also means the data exists here permanently rather
-- than living only in Salesforce, which is the point of the migration off it.
--
-- Service-role only: RLS on with no policies, matching sf_backfill_staging.
-- The edge function writes it; no client ever reads it directly.

CREATE TABLE IF NOT EXISTS public.sf_billing_line_items (
  sf_id          text PRIMARY KEY,
  billing_sf_id  text NOT NULL,
  service_name   text,
  product_name   text,
  quantity       numeric,
  mrp_per_unit   numeric,
  total_price    numeric,
  gst_rate       numeric,
  tax_amount     numeric,
  cgst_sgst      numeric,
  tax_applicable text,
  sf_created_at  timestamptz,
  imported_at    timestamptz NOT NULL DEFAULT now()
);

-- The reconciliation joins on this, once per bill.
CREATE INDEX IF NOT EXISTS sf_billing_line_items_billing_idx
  ON public.sf_billing_line_items (billing_sf_id);

ALTER TABLE public.sf_billing_line_items ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sf_billing_line_items IS
  'Raw Billing_Line_Item__c rows from Salesforce, staged verbatim. Source of '
  'truth for invoice line names, quantities, unit prices and per-line tax. '
  'Reconcile against invoices.total_amount before promoting into line_items.';
