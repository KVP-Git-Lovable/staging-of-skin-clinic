CREATE TABLE public.dashboard_pins (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.saved_reports(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_id)
);

CREATE INDEX idx_dashboard_pins_user ON public.dashboard_pins(user_id, position);

ALTER TABLE public.dashboard_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own dashboard pins"
ON public.dashboard_pins
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own dashboard pins"
ON public.dashboard_pins
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own dashboard pins"
ON public.dashboard_pins
FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own dashboard pins"
ON public.dashboard_pins
FOR DELETE TO authenticated
USING (auth.uid() = user_id);