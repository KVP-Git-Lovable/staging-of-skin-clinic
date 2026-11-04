-- Give a code to every billed line that still has none, in either era.
--
-- The historical backfill (20260922040000) was scoped to bills raised before
-- 2025-09-21, and the current era's codes came from the line-items rebuild. The
-- two together left 3 line items of 46,894 with an empty HSN, all of them
-- current-era: two at 0% and one at 5%. Three is negligible as a number, but an
-- empty HSN cell on a GST invoice is a compliance gap, and a straggler that
-- appears once will appear again.
--
-- So this is not another one-off. It sweeps both eras and fills any line whose
-- code is missing, at the rates the clinic actually uses:
--
--   Before 2025-09-21        From 2025-09-21
--   9993   exempt  (0%)      999319  exempt  (0%)
--   9997   taxable (18%)     999722  taxable (5%)
--
-- A line already carrying a code is never rewritten, and a rate the rule does
-- not recognise is left blank rather than guessed: a wrong HSN on a tax invoice
-- is worse than an empty one, because an empty cell is visibly missing and a
-- wrong code is not. That makes the whole migration re-runnable - run it again
-- whenever a straggler turns up and it writes nothing if there are none.
--
-- Mirrors hsnForRate.ts, which the importer uses for bills arriving from now on.
--
-- Touches line_items only. No total, paid, tax amount or GST rate is read or
-- written, so no figure on any invoice, report or dashboard moves.

BEGIN;

-- The rate a line was charged at: its own, or the invoice's when the line does
-- not say. Guarded, because a non-numeric gst would abort the whole migration
-- on a direct cast.
CREATE FUNCTION pg_temp.rate_of(_gst text, _fallback numeric) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _gst ~ '^-?[0-9]+(\.[0-9]+)?$' THEN _gst::numeric ELSE _fallback END;
$$;

-- The code for that rate on that date. '' means "no code applies" - never a guess.
CREATE FUNCTION pg_temp.hsn_for(_rate numeric, _billed_on timestamptz) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN _rate IS NULL THEN ''
    WHEN _billed_on < TIMESTAMPTZ '2025-09-21' THEN
      CASE WHEN _rate = 0 THEN '9993' WHEN _rate = 18 THEN '9997' ELSE '' END
    ELSE
      CASE WHEN _rate = 0 THEN '999319' WHEN _rate = 5 THEN '999722' ELSE '' END
  END;
$$;

-- The invoices this will actually change.
CREATE TEMP TABLE hsn_topup_targets ON COMMIT DROP AS
SELECT i.id
  FROM public.invoices i
 WHERE jsonb_typeof(i.line_items) = 'array'
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(i.line_items) item
      WHERE coalesce(item->>'hsn', '') = ''
        AND pg_temp.hsn_for(pg_temp.rate_of(item->>'gst', i.tax_rate), i.created_at) <> '');

-- Reversible: every invoice touched, exactly as it was.
CREATE TABLE IF NOT EXISTS public.invoice_hsn_topup_backup_20260922 (
  id uuid PRIMARY KEY,
  line_items jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.invoice_hsn_topup_backup_20260922 (id, line_items)
SELECT i.id, i.line_items
  FROM public.invoices i
  JOIN hsn_topup_targets t ON t.id = i.id
    ON CONFLICT (id) DO NOTHING;

-- WITH ORDINALITY and the matching ORDER BY: the lines on an invoice have a
-- meaning in the order they were billed, and jsonb_agg must not reshuffle them.
UPDATE public.invoices i
   SET line_items = (
     SELECT jsonb_agg(
              CASE WHEN coalesce(e.item->>'hsn', '') = ''
                    THEN jsonb_set(
                           e.item, '{hsn}',
                           to_jsonb(coalesce(
                             nullif(pg_temp.hsn_for(
                               pg_temp.rate_of(e.item->>'gst', i.tax_rate), i.created_at), ''),
                             coalesce(e.item->>'hsn', ''))))
                    ELSE e.item END
              ORDER BY e.ord)
       FROM jsonb_array_elements(i.line_items) WITH ORDINALITY AS e(item, ord))
  FROM hsn_topup_targets t
 WHERE i.id = t.id;

COMMIT;
