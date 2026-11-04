
-- Add auth_user_id to patients table
ALTER TABLE public.patients ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_patients_auth_user_id ON public.patients(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- Create cart_items table
CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(patient_id, product_id)
);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- RLS: anon can read/write (for portal phone-login users)
CREATE POLICY "Allow public read cart_items" ON public.cart_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert cart_items" ON public.cart_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update cart_items" ON public.cart_items FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete cart_items" ON public.cart_items FOR DELETE TO anon USING (true);

-- RLS: authenticated users can access their own cart via patient link
CREATE POLICY "Auth read own cart_items" ON public.cart_items FOR SELECT TO authenticated USING (
  patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
);
CREATE POLICY "Auth insert own cart_items" ON public.cart_items FOR INSERT TO authenticated WITH CHECK (
  patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
);
CREATE POLICY "Auth update own cart_items" ON public.cart_items FOR UPDATE TO authenticated USING (
  patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
);
CREATE POLICY "Auth delete own cart_items" ON public.cart_items FOR DELETE TO authenticated USING (
  patient_id IN (SELECT id FROM public.patients WHERE auth_user_id = auth.uid())
);

-- Enable realtime for cart sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_items;
