CREATE TABLE public.therapy_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_id UUID,
  note TEXT NOT NULL,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_therapy_notes_appointment ON public.therapy_notes(appointment_id, created_at DESC);

ALTER TABLE public.therapy_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view therapy notes"
  ON public.therapy_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert therapy notes"
  ON public.therapy_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update therapy notes"
  ON public.therapy_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete therapy notes"
  ON public.therapy_notes FOR DELETE TO authenticated USING (true);

CREATE TRIGGER trg_therapy_notes_updated
  BEFORE UPDATE ON public.therapy_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();