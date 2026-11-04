ALTER TABLE public.appointments DROP CONSTRAINT appointments_staff_id_fkey;
UPDATE public.appointments SET staff_id = NULL WHERE staff_id IS NOT NULL AND staff_id NOT IN (SELECT id FROM public.doctors);
ALTER TABLE public.appointments ADD CONSTRAINT appointments_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.doctors(id) ON DELETE SET NULL;