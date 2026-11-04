CREATE TABLE public.ai_repository (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('case_analysis','skin_analysis')),
  title text NOT NULL,
  content jsonb NOT NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_repository_patient_idx ON public.ai_repository(patient_id, created_at DESC);
CREATE INDEX ai_repository_appt_idx ON public.ai_repository(appointment_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.ai_repository TO authenticated;
GRANT ALL ON public.ai_repository TO service_role;
ALTER TABLE public.ai_repository ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read AI repository" ON public.ai_repository FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff add AI repository" ON public.ai_repository FOR INSERT TO authenticated WITH CHECK (true);