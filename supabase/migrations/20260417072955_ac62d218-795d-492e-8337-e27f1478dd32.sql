-- Allow deleting a tax_master row even if invoices/pharma_bills reference it
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_tax_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_tax_id_fkey
  FOREIGN KEY (tax_id) REFERENCES public.tax_master(id) ON DELETE SET NULL;

ALTER TABLE public.pharma_bills DROP CONSTRAINT IF EXISTS pharma_bills_tax_id_fkey;
ALTER TABLE public.pharma_bills
  ADD CONSTRAINT pharma_bills_tax_id_fkey
  FOREIGN KEY (tax_id) REFERENCES public.tax_master(id) ON DELETE SET NULL;