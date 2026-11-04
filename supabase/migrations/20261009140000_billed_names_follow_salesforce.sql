-- "Names must be the same as Salesforce."
--
-- They nearly all are. Of 46,925 imported bills, 46,901 already carry exactly
-- the names Salesforce's own line items do, in the same order. The 24 that did
-- not are three different things, and only one of them is a fault:
--
--   2 bills   a genuinely different name - B-49050 and B-49052, the two whose
--             tax was corrected this morning. Renamed here.
--
--  21 lines   Salesforce has NO name on the line. Ours says "Consultation",
--             which the import supplied. Matching Salesforce literally would
--             mean blanking the service on 21 issued bills, which is a loss,
--             not an alignment - a billed line with no name is worse than one
--             named by its visit. Left alone, deliberately.
--
--   1 bill    B-6827 lists the same two lines in the other order: ours is
--             "Face hair reduction (maintenance)" 2,500 then "PBE-0055" 650,
--             Salesforce's is PBE-0055 650 then the treatment 2,500. Every
--             name already sits on its own price. Renaming by position would
--             have swapped them and put the wrong name on each amount, so
--             nothing is done here either.
--
-- The money is untouched: no total, paid amount, tax or status changes. Both
-- previous names are in invoice_line_name_corrections, and the full previous
-- state of these two bills is in invoice_tax_backup_20261009.

CREATE TABLE IF NOT EXISTS public.invoice_line_name_corrections (
  invoice_id uuid NOT NULL,
  invoice_number text,
  position int NOT NULL,
  was text,
  now text,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, position, corrected_at)
);
ALTER TABLE public.invoice_line_name_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_line_name_corrections FROM anon, authenticated;

COMMENT ON TABLE public.invoice_line_name_corrections IS
  'Every billed line this app has renamed to match Salesforce, with what it said before.';

-- 1. What they said before -----------------------------------------------------

INSERT INTO public.invoice_line_name_corrections (invoice_id, invoice_number, position, was, now)
SELECT i.id, i.invoice_number, t.ord, btrim(t.e->>'name'), sf.sf_name
  FROM public.invoices i
  CROSS JOIN LATERAL jsonb_array_elements(i.line_items) WITH ORDINALITY AS t(e, ord)
  JOIN (
    SELECT billing_sf_id, row_number() OVER (PARTITION BY billing_sf_id ORDER BY sf_id) AS ord,
           btrim(coalesce(service_name, product_name, '')) AS sf_name
      FROM public.sf_billing_line_items
  ) sf ON sf.billing_sf_id = i.sf_id AND sf.ord = t.ord
 WHERE i.invoice_number IN ('B-49050','B-49052')
   AND sf.sf_name <> ''
   AND btrim(t.e->>'name') IS DISTINCT FROM sf.sf_name;

-- 2. The rename ----------------------------------------------------------------
--
-- Named bills only, and by position: every one of the 46,925 has the same
-- number of lines as Salesforce, so position is an unambiguous match. A line
-- Salesforce never named keeps what it has.

UPDATE public.invoices i
   SET line_items = (
         SELECT jsonb_agg(
                  CASE WHEN sf.sf_name IS NOT NULL AND sf.sf_name <> ''
                       THEN t.e || jsonb_build_object('name', sf.sf_name)
                       ELSE t.e END
                  ORDER BY t.ord)
           FROM jsonb_array_elements(i.line_items) WITH ORDINALITY AS t(e, ord)
           LEFT JOIN (
             SELECT billing_sf_id, row_number() OVER (PARTITION BY billing_sf_id ORDER BY sf_id) AS ord,
                    btrim(coalesce(service_name, product_name, '')) AS sf_name
               FROM public.sf_billing_line_items
           ) sf ON sf.billing_sf_id = i.sf_id AND sf.ord = t.ord
       ),
       -- The denormalised list the reports' Service filter reads, kept in step.
       services = (
         SELECT array_agg(DISTINCT btrim(coalesce(l.service_name, l.product_name, '')))
           FROM public.sf_billing_line_items l
          WHERE l.billing_sf_id = i.sf_id
            AND btrim(coalesce(l.service_name, l.product_name, '')) <> ''
       )
 WHERE i.invoice_number IN ('B-49050','B-49052');

-- Reversible from invoice_line_name_corrections one line at a time, or wholly
-- from invoice_tax_backup_20261009, which holds these two bills' line_items as
-- they stood before either change.
