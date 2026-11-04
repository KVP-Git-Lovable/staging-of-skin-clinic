CREATE TABLE public.dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  is_shared boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboards TO authenticated;
GRANT ALL ON public.dashboards TO service_role;

ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own or shared dashboards"
  ON public.dashboards FOR SELECT TO authenticated
  USING (is_shared OR owner_id = auth.uid());

CREATE POLICY "Users can create their own dashboards"
  ON public.dashboards FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can update their dashboards"
  ON public.dashboards FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners can delete their dashboards"
  ON public.dashboards FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE TRIGGER dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.dashboard_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  report_id uuid NOT NULL REFERENCES public.saved_reports(id) ON DELETE CASCADE,
  title text,
  chart_type text,
  width text NOT NULL DEFAULT 'medium',
  height text NOT NULL DEFAULT 'medium',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_components TO authenticated;
GRANT ALL ON public.dashboard_components TO service_role;

ALTER TABLE public.dashboard_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view components of visible dashboards"
  ON public.dashboard_components FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND (d.is_shared OR d.owner_id = auth.uid())));

CREATE POLICY "Owners can add components"
  ON public.dashboard_components FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND d.owner_id = auth.uid()));

CREATE POLICY "Owners can update components"
  ON public.dashboard_components FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND d.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND d.owner_id = auth.uid()));

CREATE POLICY "Owners can delete components"
  ON public.dashboard_components FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dashboards d WHERE d.id = dashboard_id AND d.owner_id = auth.uid()));

CREATE INDEX dashboard_components_dashboard_idx ON public.dashboard_components(dashboard_id, position);

CREATE TRIGGER dashboard_components_updated_at
  BEFORE UPDATE ON public.dashboard_components
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();