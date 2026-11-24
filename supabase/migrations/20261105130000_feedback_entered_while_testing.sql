-- Feedback entered while testing the new Feedback tab.
--
-- The clinic recorded a piece of feedback against Suyog Hegde to see the tab
-- working, then edited it twice through the patient portal to check that path
-- too. It is synthetic, it sits in a clinical table, and they want it out
-- before it counts as a response in the feedback reports.
--
-- The snapshot trigger added that morning recorded the whole test, which is
-- how we know exactly what happened:
--
--   11:23:47  NPS 10, 4 stars   created from the staff Feedback tab
--   11:25:01  NPS  9, 5 stars   edited in the portal  -> revision kept 10/4
--   11:26:13  NPS  9, 3 stars   edited again          -> revision kept  9/5
--
-- So THREE rows go, not one: the feedback row and its two snapshots in
-- patient_feedback_revisions, which carry `on delete cascade` and would
-- otherwise disappear silently with the parent.
--
-- This is the only feedback in the table attached to an appointment that has
-- not happened yet - the visit is 6 Nov and still Reserved - which is what
-- marks it as a test, since real feedback follows a visit. The appointment
-- itself is a genuine Walk-in booking and is NOT touched; with the feedback
-- gone its Feedback tab shows the blank form again, ready for the real
-- answers after the visit.
--
-- patient_feedback has no Trash, so a delete here is final. Everything is
-- therefore copied first and the delete cannot run unless the copy is
-- demonstrably in place - the same shape as
-- 20261029100000_feedback_given_by_mistake.sql. Re-running this file is safe:
-- on an environment where the row never existed it does nothing and says so.

-- ── The backups ──────────────────────────────────────────────────────────────
create table if not exists public.patient_feedback_backup_20261105
  (like public.patient_feedback including defaults);

create table if not exists public.patient_feedback_revisions_backup_20261105
  (like public.patient_feedback_revisions including defaults);

comment on table public.patient_feedback_backup_20261105 is
  'Feedback entered on 5 Nov 2026 while testing the Feedback tab, removed at '
  'the clinic''s request because patient_feedback has no Trash. Safe to drop '
  'on request.';

comment on table public.patient_feedback_revisions_backup_20261105 is
  'The edit snapshots belonging to the 5 Nov test feedback, copied before the '
  'parent row was deleted and took them with it. Safe to drop on request.';

-- `create table ... (like ...)` copies neither row-level security nor grants.
-- That is how patient_feedback_backup_20261029 came to be readable by the
-- anonymous role while patient_feedback itself is closed to it. These two
-- carry the same protection as the tables they are copied from.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patient_feedback_backup_20261105',
    'patient_feedback_revisions_backup_20261105'
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
  end loop;
end $$;

-- ── The removal ──────────────────────────────────────────────────────────────
do $$
declare
  v_feedback   uuid := '8103ea27-7d95-46e1-9301-fc0ecff46c92';
  v_appt       uuid := '08c0ed4a-82ef-4785-8712-c6d272fc5445';
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

  -- The snapshots go first. They cascade off the parent, so copying them
  -- afterwards would be copying nothing.
  select count(*) into v_revisions
    from public.patient_feedback_revisions where feedback_id = v_feedback;

  insert into public.patient_feedback_revisions_backup_20261105
  select r.* from public.patient_feedback_revisions r
   where r.feedback_id = v_feedback
     and not exists (
       select 1 from public.patient_feedback_revisions_backup_20261105 b
        where b.id = r.id
     );

  select count(*) into v_rev_saved
    from public.patient_feedback_revisions_backup_20261105
   where feedback_id = v_feedback;

  if v_rev_saved <> v_revisions then
    raise exception
      'Only % of % edit snapshots were backed up - nothing has been deleted',
      v_rev_saved, v_revisions;
  end if;

  insert into public.patient_feedback_backup_20261105
  select f.* from public.patient_feedback f
   where f.id = v_feedback
     and not exists (
       select 1 from public.patient_feedback_backup_20261105 b where b.id = f.id
     );

  select count(*) into v_saved
    from public.patient_feedback_backup_20261105 where id = v_feedback;

  if v_saved <> 1 then
    raise exception 'Feedback % was not backed up (% copies found) - nothing has been deleted',
      v_feedback, v_saved;
  end if;

  -- By id AND appointment, never by the comment text: three rows in this
  -- table read "All good" and the other two are real.
  delete from public.patient_feedback
   where id = v_feedback and appointment_id = v_appt;
  get diagnostics v_removed = row_count;

  -- The clinic enters real feedback all day, so the guard is the difference,
  -- not an expected total.
  select count(*) into v_after from public.patient_feedback;
  if v_before - v_after <> 1 then
    raise exception 'Expected exactly one row to go, but the count moved from % to %',
      v_before, v_after;
  end if;

  raise notice
    'Removed % test feedback row for appointment %; backups hold % feedback and % snapshots',
    v_removed, v_appt, v_saved, v_rev_saved;
end $$;
