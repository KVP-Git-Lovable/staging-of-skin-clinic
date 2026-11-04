CREATE TABLE public.duplicate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_key text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  match_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.duplicate_rules TO authenticated;
GRANT ALL ON public.duplicate_rules TO service_role;

ALTER TABLE public.duplicate_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view duplicate rules" ON public.duplicate_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert duplicate rules" ON public.duplicate_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update duplicate rules" ON public.duplicate_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete duplicate rules" ON public.duplicate_rules FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_duplicate_rules_updated_at BEFORE UPDATE ON public.duplicate_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();