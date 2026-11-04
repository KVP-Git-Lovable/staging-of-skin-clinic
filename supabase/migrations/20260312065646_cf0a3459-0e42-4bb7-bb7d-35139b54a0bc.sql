
-- Portal orders table
CREATE TABLE public.portal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  patient_name text,
  status text NOT NULL DEFAULT 'Pending',
  delivery_method text NOT NULL DEFAULT 'pickup',
  address text,
  city text,
  state text,
  pincode text,
  phone text,
  payment_status text NOT NULL DEFAULT 'Pending',
  payment_mode text DEFAULT 'COD',
  total_amount numeric NOT NULL DEFAULT 0,
  tracking_number text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Portal order items
CREATE TABLE public.portal_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.portal_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.pharma_products(id),
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portal_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for portal_orders
CREATE POLICY "Allow public read portal_orders" ON public.portal_orders FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert portal_orders" ON public.portal_orders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update portal_orders" ON public.portal_orders FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Auth read portal_orders" ON public.portal_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert portal_orders" ON public.portal_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update portal_orders" ON public.portal_orders FOR UPDATE TO authenticated USING (true);

-- RLS policies for portal_order_items
CREATE POLICY "Allow public read portal_order_items" ON public.portal_order_items FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert portal_order_items" ON public.portal_order_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth read portal_order_items" ON public.portal_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert portal_order_items" ON public.portal_order_items FOR INSERT TO authenticated WITH CHECK (true);
