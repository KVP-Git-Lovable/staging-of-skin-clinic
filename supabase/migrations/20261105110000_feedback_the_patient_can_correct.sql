-- The patient's own feedback, in the patient portal, correctable.
--
-- Today feedback is a staff-only screen: the front desk types the patient's
-- answers into the appointment sheet's Feedback tab, and once the row exists
-- there is no way to change it from anywhere in the app. When Shaida tapped
-- NPS 1 and two stars by mistake on 29 October the only remedy was a
-- migration that DELETED her row (20261029100000_feedback_given_by_mistake),
-- because patient_feedback carries UNIQUE (appointment_id) and a second row
-- for that visit is impossible while the first one is there. A delete is
-- final - patient_feedback is not covered by Trash.
--
-- The clinic wants the patient to be able to put it right themselves. Three
-- things have to be true for that to be safe:
--
--   1. The portal has to be able to SHOW a patient their own feedback, and
--      only their own. The portal is not a Supabase-auth app, so this goes
--      through the portal-data edge function exactly like appointments and
--      invoices do - never through a new anonymous grant on a clinical table.
--
--   2. An edit must not destroy the original answer. NPS 1 is clinically
--      interesting even when the patient later says they meant 9, and the
--      clinic's standing rule is that old data matters. So every UPDATE
--      snapshots the previous values into patient_feedback_revisions first.
--      Nothing in this migration can lose a figure that was already recorded.
--
--   3. It must be switchable. The portal's module flags already exist in
--      portal_settings; Feedback joins them - as the only one that defaults
--      OFF, because it is new and the clinic turns it on deliberately.
--
-- Backward compatibility: the clinic runs the PUBLISHED build at
-- clinic.quickapp.ai, which does not change until somebody publishes, while
-- this migration reaches the same database the moment it is applied. So
-- everything here is additive - a new column with a default, two new nullable
-- columns, a new table - and the one thing it takes away is an anonymous
-- WRITE that no build has ever used (see the end of this file).

-- ── 1. The module flag ───────────────────────────────────────────────────────
-- Default false, unlike every other portal module flag. The published build
-- does not know this column exists, so it renders no Feedback tab either way.
alter table public.portal_settings
  add column if not exists feedback_enabled boolean not null default false;

comment on column public.portal_settings.feedback_enabled is
  'Show the Feedback tab in the patient portal, where a patient can read and correct their own feedback. Defaults off: it is opt-in.';

-- ── 2. Who last touched a piece of feedback, and when ───────────────────────
-- patient_feedback had no updated_at and no notion of an editor at all, which
-- was fine while nothing could edit it. Both are nullable: null means the row
-- has never been edited since it was submitted.
alter table public.patient_feedback
  add column if not exists updated_at timestamptz,
  add column if not exists last_edited_by text;

alter table public.patient_feedback
  drop constraint if exists patient_feedback_last_edited_by_check;
alter table public.patient_feedback
  add constraint patient_feedback_last_edited_by_check
  check (last_edited_by is null or last_edited_by in ('patient', 'staff'));

comment on column public.patient_feedback.last_edited_by is
  'patient = corrected by the patient in the portal; staff = corrected by the clinic; null = never edited.';

-- ── 3. The original answers are kept, always ────────────────────────────────
-- A row per superseded version, written by a trigger rather than by whichever
-- screen happens to be doing the editing - so it cannot be bypassed by a new
-- edit path later, and it already covers staff edits that do not exist yet.
create table if not exists public.patient_feedback_revisions (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references public.patient_feedback(id) on delete cascade,
  appointment_id uuid,
  patient_id uuid,
  nps_score integer,
  service_rating integer,
  comments text,
  -- When the version being superseded was itself recorded.
  recorded_at timestamptz,
  -- When it was superseded, and by whom.
  superseded_at timestamptz not null default now(),
  superseded_by text
);

create index if not exists patient_feedback_revisions_feedback_idx
  on public.patient_feedback_revisions (feedback_id, superseded_at desc);
create index if not exists patient_feedback_revisions_patient_idx
  on public.patient_feedback_revisions (patient_id);

comment on table public.patient_feedback_revisions is
  'Immutable snapshots of patient_feedback rows as they were before each edit. Append-only: no screen may update or delete a row here.';

create or replace function public.snapshot_patient_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only when an answer actually changed. A touch that rewrites the same
  -- numbers should not manufacture a revision.
  if new.nps_score is distinct from old.nps_score
     or new.service_rating is distinct from old.service_rating
     or new.comments is distinct from old.comments then
    insert into public.patient_feedback_revisions (
      feedback_id, appointment_id, patient_id,
      nps_score, service_rating, comments,
      recorded_at, superseded_by
    ) values (
      old.id, old.appointment_id, old.patient_id,
      old.nps_score, old.service_rating, old.comments,
      coalesce(old.updated_at, old.created_at), new.last_edited_by
    );
    -- Stamped here rather than trusted from the caller, so updated_at is
    -- reliable whichever screen did the editing, and so the NEXT revision
    -- knows when this version was recorded.
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists patient_feedback_snapshot on public.patient_feedback;
create trigger patient_feedback_snapshot
  before update on public.patient_feedback
  for each row execute function public.snapshot_patient_feedback();

-- Staff read the history; only the trigger (service_role / definer) writes it.
alter table public.patient_feedback_revisions enable row level security;
revoke all on public.patient_feedback_revisions from anon;
grant select on public.patient_feedback_revisions to authenticated;
grant all on public.patient_feedback_revisions to service_role;

drop policy if exists "Authenticated staff can read patient_feedback_revisions"
  on public.patient_feedback_revisions;
create policy "Authenticated staff can read patient_feedback_revisions"
  on public.patient_feedback_revisions for select to authenticated using (true);

-- ── 4. Close the anonymous write on portal_settings ─────────────────────────
-- portal_settings was created with three policies that carry no TO clause, so
-- they apply to PUBLIC - anon included - and anon also holds the table grants.
-- Anybody with the publishable key can therefore flip every portal module flag
-- today, including the Feedback one this migration adds. Nothing has ever
-- needed that: the portal, /shop and the shop product page only SELECT, and
-- the only writer is the staff settings panel, which runs as `authenticated`
-- and keeps its own "Auth insert/update portal_settings" policies.
--
-- anon KEEPS SELECT. The published build reads this table with the anonymous
-- key to decide which portal tabs to show, so taking that away would blank
-- the clinic's live portal.
drop policy if exists "Allow public insert portal_settings" on public.portal_settings;
drop policy if exists "Allow public update portal_settings" on public.portal_settings;
revoke insert, update, delete, truncate, references on public.portal_settings from anon;
