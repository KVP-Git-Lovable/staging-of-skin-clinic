CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON public.appointments (start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status_created_at ON public.invoices (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON public.invoices (patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON public.patients (created_at DESC);