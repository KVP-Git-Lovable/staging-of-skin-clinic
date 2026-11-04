CREATE TABLE public.validation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  object_key TEXT NOT NULL,
  field_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  execute_when TEXT NOT NULL DEFAULT 'criteria_met',
  validate_on TEXT NOT NULL DEFAULT 'save_only',
  config JSONB NOT NULL DEFAULT '{"branches":[]}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.validation_rules TO authenticated;
GRANT ALL ON public.validation_rules TO service_role;

ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view validation rules"
  ON public.validation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create validation rules"
  ON public.validation_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update validation rules"
  ON public.validation_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete validation rules"
  ON public.validation_rules FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_validation_rules_object ON public.validation_rules (object_key, is_active);

CREATE TRIGGER update_validation_rules_updated_at
  BEFORE UPDATE ON public.validation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();