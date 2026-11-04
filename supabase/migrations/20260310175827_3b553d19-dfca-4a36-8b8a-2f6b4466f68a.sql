
CREATE TABLE public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  primary_object TEXT NOT NULL,
  related_object TEXT,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  group_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  group_columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  chart_type TEXT NOT NULL DEFAULT 'table',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read saved_reports" ON public.saved_reports FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert saved_reports" ON public.saved_reports FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update saved_reports" ON public.saved_reports FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete saved_reports" ON public.saved_reports FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read saved_reports" ON public.saved_reports FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert saved_reports" ON public.saved_reports FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update saved_reports" ON public.saved_reports FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete saved_reports" ON public.saved_reports FOR DELETE TO authenticated USING (true);
