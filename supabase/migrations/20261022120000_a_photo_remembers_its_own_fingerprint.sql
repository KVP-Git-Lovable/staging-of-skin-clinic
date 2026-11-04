-- A photo carries a fingerprint, so the same photo can be found again.
--
-- The clinic's problem: a photograph arrives on WhatsApp, or turns up on
-- somebody's phone, and nobody knows whose record it belongs to. There are
-- 87,879 photos across 5,821 patients - finding it by eye is not an option.
--
-- phash is a 64-bit dHash written as 16 hex characters (see src/lib/photoHash.ts
-- for how it is computed and what it can and cannot see through). Two photos
-- are compared by counting how many of those 64 bits differ, which is what
-- bit_count on the XOR below does.
--
-- text rather than bit(64) on purpose: the client inserts a plain string with
-- no PostgREST type friction, and the conversion happens here, once per row,
-- with the ('x' || ...)::bit(64) idiom. A photo search runs once per chosen
-- photo rather than once per keystroke, so scanning every row costs
-- milliseconds and there is nothing here worth indexing for it.

alter table public.patient_photos
  add column if not exists phash text;

-- Exactly sixteen lowercase hex characters, or nothing at all. A photo whose
-- hash could not be computed saves with a null and the backfill picks it up
-- later - an unreadable image must never block an upload.
do $$
begin
  alter table public.patient_photos
    add constraint patient_photos_phash_format
    check (phash is null or phash ~ '^[0-9a-f]{16}$');
exception
  when duplicate_object then null;
end
$$;

-- The backfill's own query: the newest photos still without a fingerprint.
-- Partial, so it covers only what is left to do and shrinks to nothing as the
-- backfill finishes.
create index if not exists patient_photos_unhashed_idx
  on public.patient_photos (taken_at desc)
  where phash is null;

comment on column public.patient_photos.phash is
  '64-bit dHash of the photo as 16 hex chars. Finds the SAME photograph through '
  'resizing and recompression - not the same person, and not through a crop. '
  'Computed in the browser by src/lib/photoHash.ts; null until backfilled.';

-- Which patients hold a photo matching this fingerprint, closest first.
--
-- security invoker, so the four RLS policies already on patient_photos keep
-- deciding who is allowed to see what. This must not become a way around them.
create or replace function public.search_patient_photos_by_hash(
  _hash text,
  _max_distance int default 10,
  _limit int default 20
)
returns table (
  photo_id uuid,
  patient_id uuid,
  photo_url text,
  taken_at timestamptz,
  distance int
)
language sql
stable
security invoker
set search_path = public
as $fn$
  -- The distance is worked out in the inner query and filtered on in the
  -- outer, so bit_count runs once per row rather than once per row per clause.
  select m.photo_id, m.patient_id, m.photo_url, m.taken_at, m.distance
  from (
    select
      pp.id as photo_id,
      pp.patient_id as patient_id,
      pp.photo_url as photo_url,
      pp.taken_at as taken_at,
      bit_count(
        ('x' || pp.phash)::bit(64) # ('x' || lower(trim(_hash)))::bit(64)
      )::int as distance
    from public.patient_photos pp
    where pp.phash is not null
      -- A malformed fingerprint from the caller returns nothing rather than
      -- erroring on the cast below.
      and lower(trim(_hash)) ~ '^[0-9a-f]{16}$'
  ) m
  where m.distance <= greatest(0, least(coalesce(_max_distance, 10), 64))
  order by m.distance asc, m.taken_at desc nulls last
  limit greatest(1, least(coalesce(_limit, 20), 100));
$fn$;

grant execute on function public.search_patient_photos_by_hash(text, int, int) to authenticated;

-- Record a batch of fingerprints in one round trip.
--
-- The backfill has 87,879 photos to get through. Updating them one at a time
-- would be 87,879 requests; this takes a batch as JSON and does them in a
-- single statement.
--
-- security invoker, like the search above, so the table's own update policy
-- still applies. It only ever writes phash, and only when the value really is
-- a fingerprint - a malformed entry is skipped rather than stored.
create or replace function public.set_patient_photo_hashes(_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  updated integer;
begin
  with incoming as (
    select (r->>'id')::uuid as id, lower(trim(r->>'phash')) as phash
    from jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) r
  )
  update public.patient_photos p
     set phash = i.phash
    from incoming i
   where p.id = i.id
     and i.phash ~ '^[0-9a-f]{16}$';

  get diagnostics updated = row_count;
  return updated;
end
$fn$;

grant execute on function public.set_patient_photo_hashes(jsonb) to authenticated;
