ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS auth_user_id uuid;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS force_password_change boolean DEFAULT true;