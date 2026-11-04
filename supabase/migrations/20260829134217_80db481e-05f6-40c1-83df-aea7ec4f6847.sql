CREATE TABLE public.procedure_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES public.procedures(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.services(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  procedure_notes text,
  recommendations text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_services TO authenticated;
GRANT ALL ON public.procedure_services TO service_role;

ALTER TABLE public.procedure_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view procedure services"
  ON public.procedure_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can add procedure services"
  ON public.procedure_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update procedure services"
  ON public.procedure_services FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete procedure services"
  ON public.procedure_services FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_procedure_services_procedure ON public.procedure_services(procedure_id);

CREATE TRIGGER procedure_services_updated_at
  BEFORE UPDATE ON public.procedure_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.procedure_services (procedure_id, service_name, procedure_notes, recommendations, sort_order)
SELECT p.id, COALESCE(NULLIF(p.service_name, ''), 'Consultation'), p.procedure_notes, p.recommendations, 0
FROM public.procedures p;