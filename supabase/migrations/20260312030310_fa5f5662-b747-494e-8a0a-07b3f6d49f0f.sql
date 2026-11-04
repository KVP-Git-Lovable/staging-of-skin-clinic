
CREATE TABLE public.patient_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE NOT NULL,
  patient_id uuid NOT NULL,
  patient_name text,
  nps_score integer NOT NULL,
  service_rating integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_feedback_per_appointment UNIQUE (appointment_id)
);

ALTER TABLE public.patient_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read patient_feedback" ON public.patient_feedback FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert patient_feedback" ON public.patient_feedback FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Auth read patient_feedback" ON public.patient_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert patient_feedback" ON public.patient_feedback FOR INSERT TO authenticated WITH CHECK (true);
