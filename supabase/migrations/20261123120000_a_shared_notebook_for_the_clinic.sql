-- A shared notebook, to replace the paper one on the desk.
--
-- The clinic writes rough notes in a book - who is on leave, what a supplier
-- still owes, call this patient back - and then cannot find anything in it.
-- This is the same book in the app: one list everybody signed in can see and
-- add to, with a date on every line and a search box over the lot.
--
-- Nothing here changes an existing table or column, so the CURRENTLY PUBLISHED
-- build keeps working untouched: it simply never reads this table.

create table if not exists public.clinic_notes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,

  created_at  timestamptz not null default now(),
  created_by  uuid,
  -- Kept alongside the id because a note outlives a staff row being renamed
  -- or deactivated, and "who wrote this" is most of what makes a note useful.
  created_by_name text,

  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_by_name text,

  -- Deleting is a soft delete. The clinic has said more than once that no data
  -- may be lost, and a note deleted by mistake is still somebody's reminder.
  deleted_at  timestamptz,
  deleted_by  uuid,
  deleted_by_name text
);

comment on table public.clinic_notes is
  'Shared rough notes for clinic staff. Soft-deleted only: deleted_at is set, the row is kept.';

-- The list reads the live notes newest first; the deleted drawer reads the
-- rest the same way.
create index if not exists clinic_notes_live_idx
  on public.clinic_notes (deleted_at, created_at desc);

alter table public.clinic_notes enable row level security;

-- Clinic data is staff-only at the database, and a new table gets the same
-- restrictive gate as every other one.
drop policy if exists signed_in_must_be_staff on public.clinic_notes;
create policy signed_in_must_be_staff on public.clinic_notes
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- ...and its own policies ask the same question rather than USING (true), so
-- access never rests on that one rule alone.
drop policy if exists "Authenticated staff can read clinic_notes" on public.clinic_notes;
create policy "Authenticated staff can read clinic_notes" on public.clinic_notes
  for select to authenticated
  using ((select public.is_active_staff()));

drop policy if exists "Authenticated staff can insert clinic_notes" on public.clinic_notes;
create policy "Authenticated staff can insert clinic_notes" on public.clinic_notes
  for insert to authenticated
  with check ((select public.is_active_staff()));

drop policy if exists "Authenticated staff can update clinic_notes" on public.clinic_notes;
create policy "Authenticated staff can update clinic_notes" on public.clinic_notes
  for update to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- Deliberately NO delete policy. Deleting a note sets deleted_at, so there is
-- no path from the app that can destroy one - not a mistake, not a bug, not a
-- crafted request.
drop policy if exists "Authenticated staff can delete clinic_notes" on public.clinic_notes;

drop trigger if exists clinic_notes_updated_at on public.clinic_notes;
create trigger clinic_notes_updated_at
  before update on public.clinic_notes
  for each row execute function public.update_updated_at_column();
