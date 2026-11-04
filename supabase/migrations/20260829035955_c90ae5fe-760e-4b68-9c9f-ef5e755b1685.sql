CREATE TABLE public.duplicate_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.duplicate_rules(id) ON DELETE CASCADE,
  rule_name text,
  object_key text NOT NULL,
  record_id uuid NOT NULL,
  record_label text,
  match_record_id uuid NOT NULL,
  match_record_label text,
  matched_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text NOT NULL DEFAULT 'alert',
  message text,
  status text NOT NULL DEFAULT 'open',
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX duplicate_alerts_unique_pair
  ON public.duplicate_alerts (object_key, record_id, match_record_id, COALESCE(rule_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX duplicate_alerts_status_idx ON public.duplicate_alerts (status, object_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_alerts TO authenticated;
GRANT ALL ON public.duplicate_alerts TO service_role;

ALTER TABLE public.duplicate_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view duplicate alerts"
  ON public.duplicate_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can create duplicate alerts"
  ON public.duplicate_alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update duplicate alerts"
  ON public.duplicate_alerts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete duplicate alerts"
  ON public.duplicate_alerts FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_duplicate_alerts_updated_at
  BEFORE UPDATE ON public.duplicate_alerts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();