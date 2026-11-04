
-- Expense categories / heads master
CREATE TABLE public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read expense_categories" ON public.expense_categories FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert expense_categories" ON public.expense_categories FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update expense_categories" ON public.expense_categories FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete expense_categories" ON public.expense_categories FOR DELETE TO anon USING (true);
CREATE POLICY "auth read expense_categories" ON public.expense_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert expense_categories" ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update expense_categories" ON public.expense_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete expense_categories" ON public.expense_categories FOR DELETE TO authenticated USING (true);

-- Expenses table
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_mode text DEFAULT 'Cash',
  vendor_name text,
  reference_number text,
  attachment_url text,
  attachment_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read expenses" ON public.expenses FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert expenses" ON public.expenses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update expenses" ON public.expenses FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete expenses" ON public.expenses FOR DELETE TO anon USING (true);
CREATE POLICY "auth read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update expenses" ON public.expenses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete expenses" ON public.expenses FOR DELETE TO authenticated USING (true);

-- Storage bucket for expense attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-attachments', 'expense-attachments', true);

-- Storage policies
CREATE POLICY "Public read expense-attachments" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'expense-attachments');
CREATE POLICY "Public upload expense-attachments" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'expense-attachments');
CREATE POLICY "Auth read expense-attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'expense-attachments');
CREATE POLICY "Auth upload expense-attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'expense-attachments');
CREATE POLICY "Auth delete expense-attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'expense-attachments');
