ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS facebook_url text,
ADD COLUMN IF NOT EXISTS instagram_url text,
ADD COLUMN IF NOT EXISTS follows_facebook boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS follows_instagram boolean DEFAULT false;