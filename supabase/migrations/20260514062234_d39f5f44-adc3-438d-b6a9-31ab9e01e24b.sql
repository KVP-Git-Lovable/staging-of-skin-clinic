
CREATE TABLE public.patient_campaigns (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  linked_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  linked_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id, campaign_id)
);

ALTER TABLE public.patient_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon all patient_campaigns" ON public.patient_campaigns FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "auth all patient_campaigns" ON public.patient_campaigns FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_patient_campaigns_patient ON public.patient_campaigns(patient_id);
CREATE INDEX idx_patient_campaigns_campaign ON public.patient_campaigns(campaign_id);

-- Backfill from existing patients.campaign_id
INSERT INTO public.patient_campaigns (patient_id, campaign_id)
SELECT id, campaign_id FROM public.patients WHERE campaign_id IS NOT NULL
ON CONFLICT (patient_id, campaign_id) DO NOTHING;

-- Drop old single FK column
ALTER TABLE public.patients DROP COLUMN IF EXISTS campaign_id;
