-- Repair patients where first_name was imported as a phone number
-- 153 rows identified; all already have phone populated
UPDATE public.patients
SET 
  first_name = CASE 
    WHEN email IS NOT NULL AND email <> '' THEN
      INITCAP(SPLIT_PART(SPLIT_PART(email, '@', 1), '.', 1))
    ELSE 'Patient'
  END,
  notes = CASE 
    WHEN notes IS NULL OR notes = '' THEN 'Imported name: ' || first_name
    ELSE notes || E'\nImported name: ' || first_name
  END
WHERE first_name ~ '^[0-9+\-\s()]{7,}$';