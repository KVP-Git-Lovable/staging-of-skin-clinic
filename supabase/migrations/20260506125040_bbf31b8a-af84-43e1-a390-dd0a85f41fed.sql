INSERT INTO public.user_roles_config (name, description, is_system)
SELECT sr.name, sr.description, false
FROM public.staff_roles sr
LEFT JOIN public.user_roles_config urc ON lower(urc.name) = lower(sr.name)
WHERE urc.id IS NULL;