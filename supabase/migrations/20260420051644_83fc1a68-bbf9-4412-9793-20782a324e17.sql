-- Add missing foreign keys for tax_master_services to enable PostgREST embedding
ALTER TABLE public.tax_master_services
  ADD CONSTRAINT tax_master_services_tax_id_fkey
  FOREIGN KEY (tax_id) REFERENCES public.tax_master(id) ON DELETE CASCADE;

ALTER TABLE public.tax_master_services
  ADD CONSTRAINT tax_master_services_service_id_fkey
  FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

-- Prevent duplicate links
CREATE UNIQUE INDEX IF NOT EXISTS tax_master_services_unique
  ON public.tax_master_services(tax_id, service_id);