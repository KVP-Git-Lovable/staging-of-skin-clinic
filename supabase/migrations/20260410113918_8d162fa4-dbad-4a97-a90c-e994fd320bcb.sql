
ALTER TABLE public.patients ADD COLUMN doctor_id uuid REFERENCES public.doctors(id) ON DELETE SET NULL;
ALTER TABLE public.procedures ADD COLUMN assisted_by uuid REFERENCES public.doctors(id) ON DELETE SET NULL;
