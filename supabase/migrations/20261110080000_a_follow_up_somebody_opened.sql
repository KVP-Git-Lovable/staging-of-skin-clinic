-- Who has already had a post-treatment follow-up put in front of them.
--
-- The two follow-up buttons used to send through send-followup-whatsapp, and
-- that sender wrote a row into whatsapp_conversations. Exactly one such row
-- exists: a 24-hour follow-up to Ms. Surekha on 10 Nov 2026, minutes before
-- the clinic deleted the two approved Meta templates. Outside WhatsApp's
-- 24-hour service window only an approved template is deliverable, so with
-- those gone the sender has nothing it can send.
--
-- The buttons now open the staff member's own WhatsApp with the message
-- already typed, the same way the Google review button has worked since
-- 2 Nov. Nothing about that send passes through the app, so
-- whatsapp_conversations hears nothing and a "last sent" notice built on it
-- alone would quietly stop updating. This table is the other half of it, and
-- google_review_opens is its twin - read that migration too, the reasoning is
-- identical and is not repeated here.
--
-- What a row means, exactly: a staff member opened WhatsApp with this
-- follow-up ready to send. NOT that the patient received it, and not even
-- that the staff member pressed send. The app says "Follow-up opened" rather
-- than "sent" for that reason.
--
-- Why this is a SEPARATE table from google_review_opens rather than a `kind`
-- column added to it: that table is read by the review button on the
-- CURRENTLY PUBLISHED build, which selects from it without filtering on any
-- kind. Adding follow-up rows there would make every follow-up look like a
-- review request to a build nobody has republished yet.

create table if not exists public.followup_opens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- Which visit prompted it. Null is fine: the appointment may later be
  -- deleted, and losing it must not lose the fact that the patient was
  -- contacted.
  appointment_id uuid references public.appointments(id) on delete set null,
  -- '24h' or '1week'. Checked rather than free text, so a typo in the client
  -- cannot create a third kind that no button will ever match again.
  kind text not null check (kind in ('24h', '1week')),
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now()
);

comment on table public.followup_opens is
  'One row each time a staff member opened WhatsApp with a post-treatment follow-up ready to send. Not proof of delivery, nor of sending.';

-- The notice asks one question - when was this patient last sent this kind of
-- follow-up - so the index matches it exactly.
create index if not exists followup_opens_patient_idx
  on public.followup_opens (patient_id, kind, opened_at desc);

alter table public.followup_opens enable row level security;

-- Everyone signed in can see who has been contacted. That is the whole
-- purpose: the front desk share a login, but a doctor signing in separately
-- must still see that this patient was followed up this morning.
drop policy if exists "Staff can see who has been followed up" on public.followup_opens;
create policy "Staff can see who has been followed up"
  on public.followup_opens for select to authenticated using (true);

-- Insert own rows only, so the record of who contacted the patient cannot be
-- forged.
drop policy if exists "Staff can record a follow-up" on public.followup_opens;
create policy "Staff can record a follow-up"
  on public.followup_opens for insert to authenticated
  with check (auth.uid() = opened_by);

-- No update and no delete policy, deliberately. This is a log: a row that can
-- be quietly edited away is worth nothing as a guard against messaging twice.
--
-- The revokes below are belt and braces. Row level security with no policy
-- already denies these, but this project carries default privileges that
-- grant `authenticated` every privilege on a newly created table, and relying
-- on the absence of a policy means the append-only promise is one careless
-- `create policy` away from being untrue.
revoke update, delete, truncate on public.followup_opens from authenticated;
revoke all on public.followup_opens from anon;
