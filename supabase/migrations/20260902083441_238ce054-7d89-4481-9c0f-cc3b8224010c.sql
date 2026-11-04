CREATE TABLE public.portal_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX portal_sessions_patient_idx ON public.portal_sessions(patient_id);

GRANT ALL ON public.portal_sessions TO service_role;

ALTER TABLE public.portal_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to portal sessions"
ON public.portal_sessions FOR ALL TO authenticated
USING (false) WITH CHECK (false);