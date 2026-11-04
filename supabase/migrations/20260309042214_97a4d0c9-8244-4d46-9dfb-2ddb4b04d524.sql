
-- Procedures table linked to appointments and patients
CREATE TABLE public.procedures (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  diagnosis text,
  procedure_notes text,
  consultation_notes text,
  status text NOT NULL DEFAULT 'Completed',
  procedure_date timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view procedures" ON public.procedures FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create procedures" ON public.procedures FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update procedures" ON public.procedures FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete procedures" ON public.procedures FOR DELETE TO authenticated USING (true);

-- Prescriptions table linked to procedures
CREATE TABLE public.prescriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE CASCADE NOT NULL,
  product_id uuid,
  medicine_name text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  instructions text,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view prescriptions" ON public.prescriptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create prescriptions" ON public.prescriptions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update prescriptions" ON public.prescriptions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete prescriptions" ON public.prescriptions FOR DELETE TO authenticated USING (true);

-- Pharma products table
CREATE TABLE public.pharma_products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  generic_name text,
  category text NOT NULL DEFAULT 'General',
  manufacturer text,
  unit text NOT NULL DEFAULT 'Nos',
  hsn_code text,
  gst_percent numeric(5,2) NOT NULL DEFAULT 0,
  mrp numeric(10,2) NOT NULL DEFAULT 0,
  selling_price numeric(10,2) NOT NULL DEFAULT 0,
  reorder_level integer NOT NULL DEFAULT 10,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pharma_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pharma_products" ON public.pharma_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create pharma_products" ON public.pharma_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pharma_products" ON public.pharma_products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete pharma_products" ON public.pharma_products FOR DELETE TO authenticated USING (true);

-- Pharma inventory (batch-level tracking)
CREATE TABLE public.pharma_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id uuid REFERENCES public.pharma_products(id) ON DELETE CASCADE NOT NULL,
  batch_number text NOT NULL,
  expiry_date date NOT NULL,
  quantity integer NOT NULL DEFAULT 0,
  purchase_price numeric(10,2) NOT NULL DEFAULT 0,
  supplier text,
  invoice_number text,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pharma_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pharma_inventory" ON public.pharma_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create pharma_inventory" ON public.pharma_inventory FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pharma_inventory" ON public.pharma_inventory FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete pharma_inventory" ON public.pharma_inventory FOR DELETE TO authenticated USING (true);

-- Pharma bills (outward)
CREATE TABLE public.pharma_bills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_number text NOT NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name text,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  discount numeric(10,2) NOT NULL DEFAULT 0,
  net_amount numeric(10,2) NOT NULL DEFAULT 0,
  payment_mode text NOT NULL DEFAULT 'Cash',
  status text NOT NULL DEFAULT 'Paid',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pharma_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pharma_bills" ON public.pharma_bills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create pharma_bills" ON public.pharma_bills FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update pharma_bills" ON public.pharma_bills FOR UPDATE TO authenticated USING (true);

-- Pharma bill items
CREATE TABLE public.pharma_bill_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id uuid REFERENCES public.pharma_bills(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES public.pharma_products(id) ON DELETE SET NULL,
  inventory_id uuid REFERENCES public.pharma_inventory(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  batch_number text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  total_price numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pharma_bill_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pharma_bill_items" ON public.pharma_bill_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create pharma_bill_items" ON public.pharma_bill_items FOR INSERT TO authenticated WITH CHECK (true);

-- Add foreign key from prescriptions to pharma_products
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.pharma_products(id) ON DELETE SET NULL;

-- Add updated_at triggers
CREATE TRIGGER update_procedures_updated_at BEFORE UPDATE ON public.procedures FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_pharma_products_updated_at BEFORE UPDATE ON public.pharma_products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
