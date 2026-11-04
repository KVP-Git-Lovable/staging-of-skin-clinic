ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS appointment_type text NOT NULL DEFAULT 'Walk-in';

UPDATE public.appointments SET appointment_type = 'Walk-in' WHERE appointment_type IS NULL;