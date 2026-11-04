
CREATE TABLE public.procedure_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.procedure_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read procedure_attachments" ON public.procedure_attachments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert procedure_attachments" ON public.procedure_attachments FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update procedure_attachments" ON public.procedure_attachments FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete procedure_attachments" ON public.procedure_attachments FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read procedure_attachments" ON public.procedure_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert procedure_attachments" ON public.procedure_attachments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update procedure_attachments" ON public.procedure_attachments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete procedure_attachments" ON public.procedure_attachments FOR DELETE TO authenticated USING (true);

INSERT INTO storage.buckets (id, name, public) VALUES ('procedure-attachments', 'procedure-attachments', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Allow public read procedure-attachments" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'procedure-attachments');
CREATE POLICY "Allow public insert procedure-attachments" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'procedure-attachments');
CREATE POLICY "Allow public delete procedure-attachments" ON storage.objects FOR DELETE TO anon USING (bucket_id = 'procedure-attachments');
CREATE POLICY "Auth read procedure-attachments" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'procedure-attachments');
CREATE POLICY "Auth insert procedure-attachments" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'procedure-attachments');
CREATE POLICY "Auth delete procedure-attachments" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'procedure-attachments');
