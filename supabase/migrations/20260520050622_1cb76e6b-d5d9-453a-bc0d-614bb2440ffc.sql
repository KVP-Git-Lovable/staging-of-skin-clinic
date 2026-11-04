CREATE TABLE IF NOT EXISTS public.bolna_booking_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_payload jsonb NOT NULL,
  patient_phone text,
  patient_name text,
  doctor_name text,
  service_name text,
  requested_start timestamptz,
  requested_end timestamptz,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  success boolean NOT NULL DEFAULT false,
  status_code integer,
  message text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bolna_booking_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bolna_booking_logs_created_at ON public.bolna_booking_logs(created_at DESC);