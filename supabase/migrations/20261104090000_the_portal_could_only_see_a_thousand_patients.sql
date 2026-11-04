-- Let the portal find a patient by phone without reading the whole table.
--
-- A patient logging into the portal with their registered number was told
-- the number is not registered. portal-auth fetched
--   patients?...&order=created_at.desc&limit=5000
-- and then matched in JavaScript. PostgREST caps a response at 1000 rows -
-- a cap this codebase already documents in sf-match-phones and in
-- src/lib/supabasePaginate.ts and pages around in both - so the function
-- only ever saw the 1000 most recently created patients. Of 27,625
-- patients, 26,625 could not log in. The Forgot-PIN path had the same bug
-- with limit=2000.
--
-- The fix is to ask the database the question instead of downloading rows
-- and asking in JavaScript.
--
-- WHY GENERATED COLUMNS. The match is on the last ten digits, because the
-- clinic's numbers are stored every which way: "9663438657",
-- "+91 96634 38657", "919663438657". Computing that in the WHERE clause
-- would mean a sequential scan of 27,625 rows on every login. Stored and
-- indexed, it is a single index lookup, and Postgres keeps it in step with
-- the phone column for ever - there is no trigger to forget and no
-- backfill to re-run.
--
-- The existing phone indexes are trigram, for the staff screen's fuzzy
-- search. They cannot serve an equality lookup.

alter table public.patients
  add column if not exists phone_last10 text
    generated always as (
      nullif(right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10), '')
    ) stored,
  add column if not exists alternate_phone_last10 text
    generated always as (
      nullif(right(regexp_replace(coalesce(alternate_phone, ''), '\D', '', 'g'), 10), '')
    ) stored;

comment on column public.patients.phone_last10 is
  'The last ten digits of phone, maintained by Postgres. The clinic stores numbers with +91, spaces and leading zeros; this is the form they are matched on.';

create index if not exists patients_phone_last10_idx
  on public.patients (phone_last10);
create index if not exists patients_alternate_phone_last10_idx
  on public.patients (alternate_phone_last10);

-- ---------------------------------------------------------------------------
-- Everyone on a number, not the first one found
-- ---------------------------------------------------------------------------
-- 5,825 patients - a fifth of the clinic - share a phone with at least one
-- other patient, and one number is on fourteen of them. They are families.
-- The portal PIN is per patient, so a lookup that returns "the" patient for
-- a number silently picks one and locks out everybody else on it. This
-- returns them all and lets the caller ask which person is logging in.
--
-- alternate_phone is matched too. The staff patient list has always
-- searched it (src/lib/patientsPage.ts) while the portal never did, so a
-- patient whose portal number is the alternate one was told they were not
-- registered.
--
-- SECURITY DEFINER with a pinned search_path: the portal calls this before
-- anyone is signed in, and it returns only the columns the login needs -
-- no address, no clinical history. portal_pin_hash is among them because
-- the caller is the portal's own edge function, running with the service
-- role, which could read the row anyway.
create or replace function public.portal_patients_by_phone(p_last10 text)
returns table (
  id uuid,
  first_name text,
  last_name text,
  portal_pin_hash text,
  portal_pin_failed_attempts integer,
  portal_pin_locked_until timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name,
         p.portal_pin_hash, p.portal_pin_failed_attempts, p.portal_pin_locked_until
  from public.patients p
  -- Ten digits exactly. A shorter input is not an incomplete search, it is
  -- not a phone number, and must never be allowed to match the tail of
  -- somebody's.
  where length(coalesce(p_last10, '')) = 10
    and (p.phone_last10 = p_last10 or p.alternate_phone_last10 = p_last10)
  order by p.registered_at desc nulls last, p.id;
$$;

comment on function public.portal_patients_by_phone(text) is
  'Every patient reachable on a ten-digit number, newest registration first. One definition of "this number belongs to this patient", shared by portal-auth, portal-otp-send and portal-otp-verify.';

revoke all on function public.portal_patients_by_phone(text) from public, anon, authenticated;
