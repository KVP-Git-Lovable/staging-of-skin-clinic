ALTER TABLE public.portal_order_items
  DROP CONSTRAINT IF EXISTS portal_order_items_product_id_fkey;

ALTER TABLE public.portal_order_items
  ADD CONSTRAINT portal_order_items_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.pharma_products(id)
  ON DELETE SET NULL;

ALTER TABLE public.patient_pharma_requests
  DROP CONSTRAINT IF EXISTS patient_pharma_requests_product_id_fkey;

ALTER TABLE public.patient_pharma_requests
  ADD CONSTRAINT patient_pharma_requests_product_id_fkey
  FOREIGN KEY (product_id)
  REFERENCES public.pharma_products(id)
  ON DELETE SET NULL;