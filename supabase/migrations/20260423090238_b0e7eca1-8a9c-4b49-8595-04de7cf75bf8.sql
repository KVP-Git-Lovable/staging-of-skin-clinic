UPDATE public.patients
SET date_of_birth = date_of_birth - INTERVAL '100 years'
WHERE date_of_birth > CURRENT_DATE;