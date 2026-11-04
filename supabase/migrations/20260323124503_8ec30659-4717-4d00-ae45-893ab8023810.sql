ALTER TABLE public.asset_service_links 
  ADD COLUMN IF NOT EXISTS usage_guideline text,
  ADD COLUMN IF NOT EXISTS time_taken integer;