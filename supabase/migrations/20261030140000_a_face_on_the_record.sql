-- A face on the record.
--
-- The patient profile has only ever shown initials in a circle. The clinic
-- wants a photograph there - taken on the spot, or chosen from the photos
-- already on the record - so staff recognise who they are looking at.
--
-- Nullable and unread until the screen asks for it, so adding it changes
-- nothing on its own.
--
-- It holds a URL rather than a file. A photo chosen from the patient's own
-- set is referenced where it already lives rather than copied, so the two
-- cannot drift apart - and if that photo is later deleted the column points at
-- nothing, which is why the avatar falls back to initials when the image will
-- not load.

alter table public.patients
  add column if not exists avatar_url text;

comment on column public.patients.avatar_url is
  'Profile picture for the patient record. Either an uploaded portrait or the '
  'URL of one of their existing photos. Null means show their initials.';
