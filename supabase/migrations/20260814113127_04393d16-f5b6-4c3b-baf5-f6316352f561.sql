ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS parent_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_parent_appointment_id_idx ON public.appointments(parent_appointment_id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS installment_number integer,
  ADD COLUMN IF NOT EXISTS installment_count integer,
  ADD COLUMN IF NOT EXISTS recurring_group_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE INDEX IF NOT EXISTS invoices_recurring_group_id_idx ON public.invoices(recurring_group_id);
CREATE INDEX IF NOT EXISTS invoices_appointment_id_idx ON public.invoices(appointment_id);