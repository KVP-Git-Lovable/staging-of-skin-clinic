-- Add SGST column to hsn_tax_master table
ALTER TABLE public.hsn_tax_master
ADD COLUMN sgst numeric DEFAULT 0;

-- Update existing records to have 0 for SGST if they don't have it
UPDATE public.hsn_tax_master SET sgst = 0 WHERE sgst IS NULL;

-- Make the column NOT NULL
ALTER TABLE public.hsn_tax_master
ALTER COLUMN sgst SET NOT NULL;
