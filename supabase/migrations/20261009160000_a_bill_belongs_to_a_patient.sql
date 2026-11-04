-- INV-49097 was missing from Tanushree's Invoices tab and present in Billing.
-- Its patient_id was null: the bill carried only the typed name "Tanushree ".
-- Billing lists every invoice, so it showed; the patient tab lists by the
-- link, so it could not.
--
-- Two invoices in the whole database were like this:
--
--   INV-49097  25 Sep  "Tanushree "     Rs 23,425
--   INV-49323  03 Oct  "Nirekshitha "   Rs  2,000
--
-- The hole was the guard, not the data. canCreateInvoice() asked for line
-- items and a positive amount and said nothing about a patient, so Save was
-- live with the box empty. It had been seen once before - a note in Billing
-- records "a bill could be saved with no patient at all - INV-49169 was
-- exactly that" - but that fix restored the patient on one route into the
-- form rather than closing the guard, which is why the second one still
-- happened three weeks later. The save is guarded now.
--
-- Nirekshitha is unambiguous: exactly one patient carries the name.
--
-- Tanushree is not - three patients do. She is chosen on evidence, not on the
-- name: 7d56e78d is the only one with an appointment on 25 September, the day
-- the bill was raised, and her record (6 visits, 5 invoices, Rs 1,47,880) is
-- the one the bill was expected on. The other two have no visit within a year
-- of it. With this she reads 6 invoices and Rs 1,71,305.
--
-- Nothing else on either bill changes - no total, no tax, no status, no line.
-- Both are in invoice_patient_link_corrections and reversible by setting
-- patient_id back to null.

CREATE TABLE IF NOT EXISTS public.invoice_patient_link_corrections (
  invoice_id uuid NOT NULL,
  invoice_number text,
  name_on_bill text,
  was_patient_id uuid,
  now_patient_id uuid,
  reason text,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, corrected_at)
);
ALTER TABLE public.invoice_patient_link_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoice_patient_link_corrections FROM anon, authenticated;

COMMENT ON TABLE public.invoice_patient_link_corrections IS
  'Every invoice this app has attached to a patient after the fact, with the '
  'name it carried and why that patient. A bill is money; which record it '
  'hangs on has to be readable back.';

INSERT INTO public.invoice_patient_link_corrections
  (invoice_id, invoice_number, name_on_bill, was_patient_id, now_patient_id, reason)
SELECT i.id, i.invoice_number, i.patient_name, i.patient_id,
       CASE i.invoice_number
         WHEN 'INV-49097' THEN '7d56e78d-ce3f-4127-91ad-4d1126ff2f76'::uuid
         WHEN 'INV-49323' THEN 'a8f37d31-39ff-42dc-9b63-dd3f9d105d35'::uuid
       END,
       CASE i.invoice_number
         WHEN 'INV-49097' THEN 'Three patients share this name; this is the only one with an appointment on 25 September, the day the bill was raised'
         WHEN 'INV-49323' THEN 'Exactly one patient carries this name'
       END
  FROM public.invoices i
 WHERE i.invoice_number IN ('INV-49097','INV-49323')
   AND i.patient_id IS NULL;

UPDATE public.invoices i
   SET patient_id = c.now_patient_id
  FROM public.invoice_patient_link_corrections c
 WHERE c.invoice_id = i.id AND i.patient_id IS NULL;

-- Reversible:
--   UPDATE public.invoices i SET patient_id = c.was_patient_id
--     FROM public.invoice_patient_link_corrections c WHERE c.invoice_id = i.id;
