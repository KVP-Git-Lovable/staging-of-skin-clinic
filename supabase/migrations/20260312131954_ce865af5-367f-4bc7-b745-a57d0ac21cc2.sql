
ALTER TABLE public.staff 
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS work_start_time time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS work_end_time time DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
