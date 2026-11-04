ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS visit_status TEXT;
UPDATE public.appointments SET status = 'Reserved' WHERE status IN ('Proposed','Scheduled');
UPDATE public.appointments SET status = 'Confirmed' WHERE status = 'Completed';
UPDATE public.appointments SET status = 'Cancelled' WHERE status IN ('No Show','No-show');