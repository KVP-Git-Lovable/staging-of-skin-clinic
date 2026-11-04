ALTER TABLE public.patients     ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.procedures   ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.invoices     ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.pharma_bills ADD COLUMN IF NOT EXISTS owner_id uuid;

CREATE OR REPLACE FUNCTION public.stamp_record_owner()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.owner_id := COALESCE(NEW.owner_id, auth.uid());
  ELSE
    NEW.owner_id := COALESCE(NEW.owner_id, OLD.owner_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_record_owner ON public.patients;
CREATE TRIGGER stamp_record_owner BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_owner();

DROP TRIGGER IF EXISTS stamp_record_owner ON public.appointments;
CREATE TRIGGER stamp_record_owner BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_owner();

DROP TRIGGER IF EXISTS stamp_record_owner ON public.procedures;
CREATE TRIGGER stamp_record_owner BEFORE INSERT OR UPDATE ON public.procedures
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_owner();

DROP TRIGGER IF EXISTS stamp_record_owner ON public.invoices;
CREATE TRIGGER stamp_record_owner BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_owner();

DROP TRIGGER IF EXISTS stamp_record_owner ON public.pharma_bills;
CREATE TRIGGER stamp_record_owner BEFORE INSERT OR UPDATE ON public.pharma_bills
  FOR EACH ROW EXECUTE FUNCTION public.stamp_record_owner();

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  object_type text,
  record_id uuid,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Signed-in users can create notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete their own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, is_read, created_at DESC);

DROP TRIGGER IF EXISTS notifications_updated_at ON public.notifications;
CREATE TRIGGER notifications_updated_at BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();