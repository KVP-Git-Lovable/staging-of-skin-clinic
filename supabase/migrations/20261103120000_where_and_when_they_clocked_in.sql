-- Attendance: where the photo was taken, and the settings that govern it.
--
-- Three things:
--   1. location columns, so a check-in photo's caption is also queryable
--   2. attendance_config / week_off_config, the settings an admin can change
--   3. the holidays table, which this app has ALREADY been querying from
--      Settings > Holiday Calendar without it existing
--
-- Additive throughout. Nothing is dropped or renamed.

-- ---------------------------------------------------------------------------
-- 1. Where they were
-- ---------------------------------------------------------------------------
-- The caption burned into the photo travels with the image, which is the
-- point of burning it in - but it cannot be searched, totalled or checked
-- against anything. These columns are the same facts in a form a query can
-- reach.
--
-- The reference app declares its address columns and then never writes them,
-- so its admin screen always falls back to raw coordinates. We write them.
alter table public.attendance_records
  add column if not exists check_in_location   jsonb,
  add column if not exists check_out_location  jsonb,
  add column if not exists check_in_address    text,
  add column if not exists check_out_address   text;

comment on column public.attendance_records.check_in_location is
  '{latitude, longitude, accuracy} as the browser reported it, or null when there was no fix. Best-effort: a denied permission never blocks a check-in.';

-- ---------------------------------------------------------------------------
-- 2. The settings
-- ---------------------------------------------------------------------------
-- One row, typed columns - deliberately NOT a policy_key/policy_value bag.
-- The reference has exactly that shape in attendance_policy, and it is the
-- table that was created and never wired to anything: a key/value store makes
-- it impossible to see what settings exist or to constrain them. Four columns
-- that the database can check beat four JSON keys nobody can discover.
create table if not exists public.attendance_config (
  id uuid primary key default gen_random_uuid(),
  -- Off: check-in writes straight through, no camera and no face check, and
  -- the record is marked 'bypassed' so it is clear it was never verified.
  require_selfie boolean not null default true,
  -- Off: no location permission is requested and the caption is time only.
  capture_location boolean not null default true,
  -- Applied SERVER-SIDE in verify-face-match, so it cannot be relaxed from a
  -- browser. 75 is the reference's hardcoded value.
  face_match_threshold integer not null default 75,
  -- How many goes somebody gets before being sent to an admin.
  face_max_attempts integer not null default 3,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- One row, enforced rather than hoped for: a second row would mean two
  -- answers to "is a selfie required" and no way to say which wins.
  singleton boolean not null default true,
  constraint attendance_config_single check (singleton),
  constraint attendance_config_singleton unique (singleton),
  constraint attendance_config_threshold check (face_match_threshold between 0 and 100),
  constraint attendance_config_attempts check (face_max_attempts between 1 and 10)
);

insert into public.attendance_config (require_selfie, capture_location, face_match_threshold, face_max_attempts)
values (true, true, 75, 3)
on conflict (singleton) do nothing;

alter table public.attendance_config enable row level security;

drop policy if exists "Everyone signed in reads attendance settings" on public.attendance_config;
create policy "Everyone signed in reads attendance settings"
  on public.attendance_config for select to authenticated using (true);

drop policy if exists "Admins change attendance settings" on public.attendance_config;
create policy "Admins change attendance settings"
  on public.attendance_config for update to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());

-- No insert and no delete policy: the single row is created here and is meant
-- to stay. Nothing in the app should be able to leave the clinic with no
-- settings at all.

-- ---------------------------------------------------------------------------
-- 3. Week-offs
-- ---------------------------------------------------------------------------
-- alternate_pattern lets a clinic close on, say, the 2nd and 4th Saturday -
-- which is how half of India works and is exactly why the reference has it.
create table if not exists public.week_off_config (
  id uuid primary key default gen_random_uuid(),
  day_of_week integer not null unique check (day_of_week between 0 and 6),
  is_off boolean not null default false,
  alternate_pattern text check (alternate_pattern in ('all', '1st_3rd', '2nd_4th')),
  updated_at timestamptz not null default now()
);

comment on column public.week_off_config.alternate_pattern is
  'all | 1st_3rd | 2nd_4th. Null on an is_off day is read as ''all'' - the reference has three copies of this check and they disagree on exactly that case.';

-- 0 = Sunday. Seeded closed, the rest open, which is this clinic today:
-- working_hours already has six open days with Sunday shut.
insert into public.week_off_config (day_of_week, is_off, alternate_pattern)
values (0, true, 'all'), (1, false, null), (2, false, null), (3, false, null),
       (4, false, null), (5, false, null), (6, false, null)
on conflict (day_of_week) do nothing;

alter table public.week_off_config enable row level security;

drop policy if exists "Everyone signed in reads week offs" on public.week_off_config;
create policy "Everyone signed in reads week offs"
  on public.week_off_config for select to authenticated using (true);

drop policy if exists "Admins change week offs" on public.week_off_config;
create policy "Admins change week offs"
  on public.week_off_config for update to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- 4. Holidays - a table this app has been querying all along
-- ---------------------------------------------------------------------------
-- src/components/settings/HolidayCalendar.tsx reads and writes `holidays`
-- through a cast, and the table has never existed in this database, so that
-- Settings screen fails every time it is opened. Creating it fixes that
-- screen and gives attendance its holiday list in the same move.
--
-- Columns are named for what that component already sends.
create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.holidays is
  'Clinic holidays. Read by Settings > Holiday Calendar and by attendance, which labels a record falling on one.';

create index if not exists holidays_date_idx on public.holidays (date);

alter table public.holidays enable row level security;

drop policy if exists "Everyone signed in reads holidays" on public.holidays;
create policy "Everyone signed in reads holidays"
  on public.holidays for select to authenticated using (true);

drop policy if exists "Admins manage holidays" on public.holidays;
create policy "Admins manage holidays"
  on public.holidays for all to authenticated
  using (public.is_admin_user()) with check (public.is_admin_user());
