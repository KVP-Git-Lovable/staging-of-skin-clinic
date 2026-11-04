-- Fill the HSN codes on bills raised before the September 2025 GST change.
--
-- The clinic moved to the six-digit SAC codes at the rate change. The Tax
-- Master only holds the current pair, so the first HSN backfill left every
-- pre-change bill blank:
--
--   Before 2025-09-21        From 2025-09-21
--   9997   taxable (18%)     999722  taxable (5%)
--   9993   exempt  (0%)      999319  exempt  (0%)
--
-- 30,682 bills were charged at 18% between 2020-08-03 and 2025-09-20 and get
-- 9997. Exempt bills are split by the same date: 9993 before, 999319 after.
--
-- Touches line_items only. No total, paid, tax or GST rate is read or written,
-- so no figure on any report moves.

CREATE TABLE IF NOT EXISTS public.invoice_hsn_backup_20260922 AS
SELECT id, line_items, now() AS captured_at FROM public.invoices WHERE false;

INSERT INTO public.invoice_hsn_backup_20260922
SELECT id, line_items, now()
  FROM public.invoices
 WHERE jsonb_typeof(line_items) = 'array'
   AND created_at < '2025-09-21';

UPDATE public.invoices i
   SET line_items = (
     SELECT jsonb_agg(jsonb_set(item, '{hsn}', to_jsonb(
              CASE WHEN coalesce((item->>'gst')::numeric, i.tax_rate, -1) = 0  THEN '9993'
                   WHEN coalesce((item->>'gst')::numeric, i.tax_rate, -1) = 18 THEN '9997'
                   ELSE coalesce(item->>'hsn', '') END)))
       FROM jsonb_array_elements(i.line_items) item)
 WHERE jsonb_typeof(i.line_items) = 'array'
   AND i.created_at < '2025-09-21'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(i.line_items) item
      WHERE coalesce((item->>'gst')::numeric, i.tax_rate, -1) IN (0, 18)
        AND coalesce(item->>'hsn', '') IS DISTINCT FROM
            CASE WHEN coalesce((item->>'gst')::numeric, i.tax_rate, -1) = 0 THEN '9993' ELSE '9997' END);
