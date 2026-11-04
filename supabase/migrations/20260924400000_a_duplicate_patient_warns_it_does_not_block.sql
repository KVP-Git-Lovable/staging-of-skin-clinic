-- A duplicate patient warns; it never stops a save
--
-- The one rule in `duplicate_rules` had the phone match field at
-- severity "block" and the notification at "error" - either alone made the
-- Add Patient form refuse to save, badged "Save blocked", with no way through:
-- the "save anyway" action was itself hidden for blocking rules.
--
-- Blocking on phone is wrong here. 5,618 of 27,117 patients already share a
-- phone number with someone, across 2,480 numbers, one of them shared by 14
-- people; in 2,385 of those 2,480 groups every patient has a different name.
-- Families use one mobile, so a phone match is usually a real new patient.
-- There is no unique constraint on patients.phone either - the database was
-- always happy to take them.
--
-- The engine no longer reads these values (src/lib/duplicates/engine.ts emits
-- "alert" unconditionally, and the admin page no longer offers blocking), so
-- this migration changes no behaviour. It is here so the stored rules stop
-- claiming something the application will not do.

update public.duplicate_rules
set match_fields = (
      select jsonb_agg(jsonb_set(f, '{severity}', '"alert"'::jsonb) order by ord)
      from jsonb_array_elements(match_fields) with ordinality as t(f, ord)
    )
where jsonb_typeof(match_fields) = 'array'
  and match_fields @> '[{"severity": "block"}]'::jsonb;

update public.duplicate_rules
set notification = jsonb_set(notification, '{severity}', '"alert"'::jsonb)
where notification->>'severity' is distinct from 'alert';
