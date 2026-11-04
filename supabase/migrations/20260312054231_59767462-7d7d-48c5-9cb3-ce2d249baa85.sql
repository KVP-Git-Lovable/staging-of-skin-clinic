ALTER TABLE public.patients 
ADD COLUMN source text DEFAULT 'Walk-in',
ADD COLUMN source_ad_details text DEFAULT NULL,
ADD COLUMN source_referral_doctor text DEFAULT NULL;