-- Feedback entered on 10 Nov 2026 while testing.
--
-- Suyog Hegde's record carries one piece of feedback - NPS 8, four stars,
-- comment "Testing" - recorded at 10:33 UTC against a visit that has not
-- happened yet: 11 Nov, still Reserved. Real feedback follows a visit, which
-- is what marks this one as synthetic. The clinic asked for it out before it
-- counted as a response in the feedback reports.
--
-- Same shape as 20261105130000_feedback_entered_while_testing.sql and
-- 20261029100000_feedback_given_by_mistake.sql, and for the same reason:
-- patient_feedback has no Trash, so a delete here is final. Everything is
-- copied first and the delete cannot run unless the copy verifies.
--
-- What is different from 5 Nov: this row was never edited (updated_at is
-- null), so patient_feedback_revisions holds nothing for it and ONE row goes,
-- not three. The snapshot handling is kept all the same - Suyog has portal
-- access and could edit it between this file being written and being applied,
-- which would create a snapshot that cascades off the parent and vanishes
-- silently. The revisions backup table may therefore be empty, and that is
-- the expected case rather than a sign anything went wrong.
--
-- The appointment itself is NOT touched. With the feedback gone its Feedback
-- tab shows the blank form again, ready for the real answers after the visit.
--
-- NOT touched either, and worth saying out loud because they share this row's
-- signature: two other feedback rows were recorded today against visits still
-- to come - Chaitra kinni (NPS 9, 5 stars, 23 Nov) and Shailaja (NPS 10, 5
-- stars, 17 Nov). The clinic asked for Suyog's and only Suyog's, and deleting
-- a clinical row nobody asked about is not a judgement this file gets to make.
--
-- Re-running this file is safe: where the row is already gone it says so and
-- changes nothing.

-- ── The backups ──────────────────────────────────────────────────────────────
create table if not exists public.patient_feedback_backup_20261110
  (like public.patient_feedback including defaults);

create table if not exists public.patient_feedback_revisions_backup_20261110
  (like public.patient_feedback_revisions including defaults);

comment on table public.patient_feedback_backup_20261110 is
  'Feedback entered on 10 Nov 2026 while testing, removed at the clinic''s '
  'request because patient_feedback has no Trash. Safe to drop on request.';

comment on table public.patient_feedback_revisions_backup_20261110 is
  'Edit snapshots belonging to the 10 Nov test feedback, copied before the '
  'parent row was deleted and took them with it. Expected to be empty: that '
  'row was never edited. Safe to drop on request.';

-- `create table ... (like ...)` copies neither row-level security nor grants,
-- which is how patient_feedback_backup_20261029 came to be readable by the
-- anonymous role while patient_feedback itself is closed to it.
--
-- signed_in_must_be_staff is the RESTRICTIVE policy every RLS-enabled table in
-- this database now carries: a permissive `using (true)` policy alone would
-- let any signed-in account read these rows, and staff logins are not the only
-- accounts that exist - patients hold one for the portal, and Suyog's own
-- portal session is how this feedback was being looked at.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patient_feedback_backup_20261110',
    'patient_feedback_revisions_backup_20261110'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);

    execute format(
      'drop policy if exists "Authenticated staff can read %1$s" on public.%1$I', t);
    execute format(
      'create policy "Authenticated staff can read %1$s" on public.%1$I '
      'for select to authenticated using (true)', t);

    execute format(
      'drop policy if exists signed_in_must_be_staff on public.%I', t);
    execute format(
      'create policy signed_in_must_be_staff on public.%I as restrictive '
      'for all to authenticated '
      'using ((select public.is_active_staff())) '
      'with check ((select public.is_active_staff()))', t);
  end loop;
end $$;

-- ── The removal ──────────────────────────────────────────────────────────────
do $$
declare
  v_feedback   uuid := '0dbd111c-fd1b-4d59-912b-33f09e7f1b58';
  v_appt       uuid := 'd48c05cd-aaf0-488f-abbf-50ef44df088b';
  v_revisions  int;
  v_rev_saved  int;
  v_saved      int;
  v_before     int;
  v_after      int;
  v_removed    int;
begin
  if not exists (select 1 from public.patient_feedback where id = v_feedback) then
    raise notice 'Feedback % is already gone - nothing to remove', v_feedback;
    return;
  end if;

  select count(*) into v_before from public.patient_feedback;

  -- Snapshots first. They cascade off the parent, so copying them afterwards
  -- would be copying nothing.
  select count(*) into v_revisions
    from public.patient_feedback_revisions where feedback_id = v_feedback;

  insert into public.patient_feedback_revisions_backup_20261110
  select r.* from public.patient_feedback_revisions r
   where r.feedback_id = v_feedback
     and not exists (
       select 1 from public.patient_feedback_revisions_backup_20261110 b
        where b.id = r.id
     );

  select count(*) into v_rev_saved
    from public.patient_feedback_revisions_backup_20261110
   where feedback_id = v_feedback;

  if v_rev_saved <> v_revisions then
    raise exception
      'Only % of % edit snapshots were backed up - nothing has been deleted',
      v_rev_saved, v_revisions;
  end if;

  insert into public.patient_feedback_backup_20261110
  select f.* from public.patient_feedback f
   where f.id = v_feedback
     and not exists (
       select 1 from public.patient_feedback_backup_20261110 b where b.id = f.id
     );

  select count(*) into v_saved
    from public.patient_feedback_backup_20261110 where id = v_feedback;

  if v_saved <> 1 then
    raise exception
      'Feedback % was not backed up (% copies found) - nothing has been deleted',
      v_feedback, v_saved;
  end if;

  -- By id AND appointment, never by the comment text: "Testing" is a word a
  -- real patient could write, and this table holds 1,052 rows the clinic
  -- depends on.
  delete from public.patient_feedback
   where id = v_feedback and appointment_id = v_appt;
  get diagnostics v_removed = row_count;

  -- The clinic enters real feedback all day, so the guard is the DIFFERENCE,
  -- not an expected total: any total written here would be wrong by the time
  -- this ran.
  select count(*) into v_after from public.patient_feedback;
  if v_before - v_after <> 1 then
    raise exception
      'Expected exactly one row to go, but the count moved from % to %',
      v_before, v_after;
  end if;

  raise notice
    'Removed % test feedback row for appointment %; backups hold % feedback and % snapshots',
    v_removed, v_appt, v_saved, v_rev_saved;
end $$;
