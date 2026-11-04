-- Add Salesforce ID tracking to services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS salesforce_id text UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_services_salesforce_id ON public.services(salesforce_id);