
CREATE TABLE public.campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Other',
  status TEXT NOT NULL DEFAULT 'Planning',
  start_date DATE,
  end_date DATE,
  budget NUMERIC NOT NULL DEFAULT 0,
  amount_spent NUMERIC NOT NULL DEFAULT 0,
  target_audience TEXT,
  goals TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all campaigns" ON public.campaigns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all campaigns" ON public.campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER campaigns_updated_at
BEFORE UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.campaign_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all campaign_updates" ON public.campaign_updates FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all campaign_updates" ON public.campaign_updates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_campaign_updates_campaign ON public.campaign_updates(campaign_id);

ALTER TABLE public.patients
  ADD COLUMN campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

CREATE INDEX idx_patients_campaign ON public.patients(campaign_id);
