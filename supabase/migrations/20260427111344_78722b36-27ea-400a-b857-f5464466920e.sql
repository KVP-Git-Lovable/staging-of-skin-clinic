
CREATE TABLE public.survey_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL,
  template_id UUID NOT NULL,
  assigned_by UUID,
  status TEXT NOT NULL DEFAULT 'pending',
  response_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_survey_assignments_patient ON public.survey_assignments(patient_id);
CREATE INDEX idx_survey_assignments_patient_status ON public.survey_assignments(patient_id, status);

ALTER TABLE public.survey_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view survey assignments"
ON public.survey_assignments FOR SELECT USING (true);

CREATE POLICY "Anyone can insert survey assignments"
ON public.survey_assignments FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update survey assignments"
ON public.survey_assignments FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete survey assignments"
ON public.survey_assignments FOR DELETE USING (true);

CREATE TRIGGER update_survey_assignments_updated_at
BEFORE UPDATE ON public.survey_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
