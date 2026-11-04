-- Create holidays table
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read holidays" ON public.holidays FOR SELECT TO anon USING (true);
CREATE POLICY "Allow authenticated read holidays" ON public.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert holidays" ON public.holidays FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update holidays" ON public.holidays FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete holidays" ON public.holidays FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_holidays_date ON public.holidays(date);
