CREATE TABLE public.whatsapp_delivery_log (
  message_sid text PRIMARY KEY,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  phone text NOT NULL,
  kind text NOT NULL DEFAULT 'confirmation',
  body_preview text,
  status text NOT NULL,
  error_code integer,
  error_message text,
  sent_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX whatsapp_delivery_log_patient_idx ON public.whatsapp_delivery_log (patient_id, sent_at DESC);
CREATE INDEX whatsapp_delivery_log_sent_idx ON public.whatsapp_delivery_log (sent_at DESC);
GRANT SELECT ON public.whatsapp_delivery_log TO authenticated;
GRANT ALL ON public.whatsapp_delivery_log TO service_role;
ALTER TABLE public.whatsapp_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can view delivery log" ON public.whatsapp_delivery_log
  FOR SELECT TO authenticated
  USING (public.has_full_data_scope() OR (patient_id IS NOT NULL AND public.is_my_patient(patient_id)));