
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS portal_pin_hash text,
  ADD COLUMN IF NOT EXISTS portal_pin_failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS portal_pin_locked_until timestamptz;

CREATE TABLE IF NOT EXISTS public.patient_portal_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  otp_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_otps_patient ON public.patient_portal_otps(patient_id, created_at DESC);

ALTER TABLE public.patient_portal_otps ENABLE ROW LEVEL SECURITY;

-- No public policies; only service role (edge functions) accesses this table.
