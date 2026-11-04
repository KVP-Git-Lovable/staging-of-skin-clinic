-- Staff attendance: the face check, and locking the record down.
--
-- attendance_records has existed for a long time and has never held a single
-- row - no screen has ever written to it, though the dashboard already reads
-- it (Index.tsx) and quietly shows nothing. This gives it the two columns the
-- face check needs, stops a second check-in opening a second row for the same
-- day, and fixes the access rules.
--
-- Everything here is additive except the policies, and those are safe to
-- replace precisely because the table is empty and nothing writes to it.

-- ---------------------------------------------------------------------------
-- 1. What the face check decided
-- ---------------------------------------------------------------------------
-- Three outcomes, not two, and the difference matters: 'verified' compared the
-- faces and they matched, 'failed' compared them and they did not, 'bypassed'
-- never compared anything because the AI gateway, the image fetch or the key
-- failed. A 'failed' means somebody's face did not match and the check-in was
-- refused. A 'bypassed' means the clinic could not tell, and the attendance
-- was recorded anyway rather than stranding the person - so an admin needs to
-- be able to see which it was.
alter table public.attendance_records
  add column if not exists check_in_face_status      text,
  add column if not exists check_in_face_confidence  integer,
  add column if not exists check_out_face_status     text,
  add column if not exists check_out_face_confidence integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'attendance_face_status_values') then
    alter table public.attendance_records
      add constraint attendance_face_status_values check (
        (check_in_face_status  is null or check_in_face_status  in ('verified','failed','bypassed')) and
        (check_out_face_status is null or check_out_face_status in ('verified','failed','bypassed'))
      );
  end if;
end $$;

comment on column public.attendance_records.check_in_face_status is
  'verified = faces compared and matched; failed = compared and did not; bypassed = never compared, the verifier was unavailable.';

-- ---------------------------------------------------------------------------
-- 2. One row per person per day
-- ---------------------------------------------------------------------------
-- Without this, a second check-in inserts a second row and the day has two
-- start times with no way to say which is real. The whole state machine - not
-- in yet, in, finished - assumes one row.
create unique index if not exists attendance_records_staff_date_uniq
  on public.attendance_records (staff_id, date);

-- ---------------------------------------------------------------------------
-- 3. Access: a record of who was present has to be hard to forge
-- ---------------------------------------------------------------------------
-- Every policy on this table was USING (true) / WITH CHECK (true), so any
-- signed-in user could insert attendance for anybody, edit anybody's times, or
-- delete the lot. That is worthless as proof of a day worked, which is the
-- only reason the table exists.
--
-- current_staff_id() and is_admin_user() are the predicates the rest of this
-- database already uses; both are SECURITY DEFINER and read auth.uid().

drop policy if exists "Authenticated staff can read attendance_records"   on public.attendance_records;
drop policy if exists "Authenticated staff can insert attendance_records" on public.attendance_records;
drop policy if exists "Authenticated staff can update attendance_records" on public.attendance_records;
drop policy if exists "Authenticated staff can delete attendance_records" on public.attendance_records;

-- Admins review everyone; everybody else sees only their own days.
create policy "Staff read own attendance, admins read all"
  on public.attendance_records for select to authenticated
  using (public.is_admin_user() or staff_id = public.current_staff_id());

-- You can only ever check yourself in.
create policy "Staff record their own attendance"
  on public.attendance_records for insert to authenticated
  with check (staff_id = public.current_staff_id());

-- Checking out updates the row that was opened at check-in. An admin can
-- correct a record; nobody else may touch another person's.
create policy "Staff close their own day, admins may correct"
  on public.attendance_records for update to authenticated
  using (public.is_admin_user() or staff_id = public.current_staff_id())
  with check (public.is_admin_user() or staff_id = public.current_staff_id());

-- Deletion is an admin act. A staff member who could delete their own row
-- could erase a late arrival and start the day again.
create policy "Only admins delete attendance"
  on public.attendance_records for delete to authenticated
  using (public.is_admin_user());

-- ---------------------------------------------------------------------------
-- 4. Where the photos live
-- ---------------------------------------------------------------------------
-- The bucket already existed, created in March with the original batch, and
-- was left PUBLIC with three "any signed-in user" policies on it. Nothing has
-- ever been stored in it (0 objects), so this is free to correct now and
-- impossible to correct later.
--
-- Public matters more here than on patient-photos: these are pictures of
-- staff faces taken for a biometric comparison. Under the DPDP Act that is
-- sensitive personal data, and a public bucket means every check-in selfie in
-- the clinic is readable by anyone who can guess or is handed the URL, with
-- no login at all.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attendance-photos', 'attendance-photos', false, 10485760)
on conflict (id) do update
  set public = false,
      file_size_limit = coalesce(storage.buckets.file_size_limit, 10485760);

-- The three that shipped with the bucket: any signed-in user could upload to
-- it, read all of it, and overwrite anything in it.
drop policy if exists "Signed-in users can upload attendance photos" on storage.objects;
drop policy if exists "Signed-in users can update attendance photos" on storage.objects;
drop policy if exists "Signed-in users can view attendance photos"   on storage.objects;

-- The first folder in the path is the staff id, so the path IS the permission
-- - the same shape knowledge-attachments uses with the user id.
drop policy if exists "Staff upload their own attendance photos" on storage.objects;
create policy "Staff upload their own attendance photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attendance-photos'
    and (storage.foldername(name))[1] = public.current_staff_id()::text
  );

drop policy if exists "Staff read own attendance photos, admins read all" on storage.objects;
create policy "Staff read own attendance photos, admins read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'attendance-photos'
    and (
      public.is_admin_user()
      or (storage.foldername(name))[1] = public.current_staff_id()::text
    )
  );

-- No update and no delete policy, deliberately. A check-in photo that can be
-- replaced after the fact proves nothing. Retention is a clinic decision and
-- wants its own purge job, not an open delete.
