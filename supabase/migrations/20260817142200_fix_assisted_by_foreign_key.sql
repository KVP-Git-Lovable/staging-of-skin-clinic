-- Fix assisted_by foreign key to point to staff table instead of doctors table
ALTER TABLE public.procedures
DROP CONSTRAINT IF EXISTS procedures_assisted_by_fkey;

ALTER TABLE public.procedures
ADD CONSTRAINT procedures_assisted_by_fkey
FOREIGN KEY (assisted_by) REFERENCES public.staff(id) ON DELETE SET NULL;
