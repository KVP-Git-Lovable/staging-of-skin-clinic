
CREATE TABLE public.report_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read report_folders" ON public.report_folders FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert report_folders" ON public.report_folders FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update report_folders" ON public.report_folders FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete report_folders" ON public.report_folders FOR DELETE TO anon USING (true);
CREATE POLICY "auth read report_folders" ON public.report_folders FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert report_folders" ON public.report_folders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update report_folders" ON public.report_folders FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete report_folders" ON public.report_folders FOR DELETE TO authenticated USING (true);

ALTER TABLE public.saved_reports ADD COLUMN folder_id uuid REFERENCES public.report_folders(id) ON DELETE SET NULL;
