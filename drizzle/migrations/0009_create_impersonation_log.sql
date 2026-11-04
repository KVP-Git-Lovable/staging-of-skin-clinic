CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff s
      JOIN public.user_roles_config urc ON urc.id = s.role_id
     WHERE s.auth_user_id = auth.uid()
       AND s.is_active IS NOT FALSE
       AND lower(urc.name) = 'admin'
  );
$$;

CREATE TABLE public.impersonation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  target_user_id uuid NOT NULL,
  target_email text,
  target_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX idx_impersonation_log_started_at ON public.impersonation_log (started_at DESC);
CREATE INDEX idx_impersonation_log_actor ON public.impersonation_log (actor_user_id, ended_at);

GRANT SELECT ON public.impersonation_log TO authenticated;
GRANT ALL ON public.impersonation_log TO service_role;

ALTER TABLE public.impersonation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read impersonation log"
  ON public.impersonation_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin_user());