
ALTER TABLE public.unit_master ADD COLUMN IF NOT EXISTS sub_unit_name text;
ALTER TABLE public.unit_master ADD COLUMN IF NOT EXISTS conversion_qty integer DEFAULT 1;

-- Seed some sub-unit data for existing units
UPDATE public.unit_master SET sub_unit_name = 'Tablet', conversion_qty = 10 WHERE name = 'Strip';
UPDATE public.unit_master SET sub_unit_name = 'Strip', conversion_qty = 10 WHERE name = 'Box';
UPDATE public.unit_master SET sub_unit_name = 'ml', conversion_qty = 100 WHERE name = 'Bottle';
UPDATE public.unit_master SET sub_unit_name = 'gm', conversion_qty = 30 WHERE name = 'Tube';
UPDATE public.unit_master SET sub_unit_name = 'gm', conversion_qty = 5 WHERE name = 'Sachet';
UPDATE public.unit_master SET sub_unit_name = 'ml', conversion_qty = 1 WHERE name = 'Vial';
UPDATE public.unit_master SET sub_unit_name = 'ml', conversion_qty = 1 WHERE name = 'Ampoule';
