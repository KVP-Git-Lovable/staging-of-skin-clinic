-- Who has already been asked for a Google review.
--
-- The review button used to send through send-google-review-whatsapp, and
-- that sender wrote a row into whatsapp_conversations - which is how the
-- "Already sent today at 3:42pm" notice knew. The notice exists because a
-- patient received the same request twice a minute apart: Meta's marketing
-- cap is intermittent, so when nothing arrives the natural thing is to press
-- again, and when the cap lifts every queued copy lands at once.
--
-- The button now opens the staff member's own WhatsApp with the message
-- already typed, because the body approved at Meta still carries the OLD
-- review link - the one that makes patients sign in to Google before they can
-- write anything. Nothing about that send passes through the app, so
-- whatsapp_conversations never hears about it and the notice would quietly
-- stop updating. This table is what it reads instead.
--
-- What a row means, exactly: a staff member opened WhatsApp with the review
-- message ready to send. NOT that the patient received it, and not even that
-- the staff member pressed send - the app cannot see either. The wording in
-- the app says "Review link opened" rather than "sent" for that reason. An
-- over-count is the safe direction here: it makes somebody pause before
-- asking twice, which is the entire point.
--
-- Visible to every signed-in user, unlike whatsapp_thread_reads which is
-- deliberately per-person. A read mark is nobody else's business; whether
-- this patient has already been pestered for a review is everybody's.

create table if not exists public.google_review_opens (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- Which visit prompted it. Null is fine: the appointment may later be
  -- deleted, and losing it must not lose the fact that the patient was asked.
  appointment_id uuid references public.appointments(id) on delete set null,
  opened_by uuid references auth.users(id) on delete set null,
  opened_at timestamptz not null default now()
);

comment on table public.google_review_opens is
  'One row each time a staff member opened WhatsApp with the Google review request ready to send. Not proof of delivery, nor of sending.';

-- The notice asks one question - when was this patient last asked - so the
-- index matches it exactly.
create index if not exists google_review_opens_patient_idx
  on public.google_review_opens (patient_id, opened_at desc);

alter table public.google_review_opens enable row level security;

-- Everyone signed in can see who has been asked. That is the whole purpose:
-- the front desk share a login today, but a doctor signing in separately must
-- still see that the patient was asked this morning.
drop policy if exists "Staff can see who has been asked" on public.google_review_opens;
create policy "Staff can see who has been asked"
  on public.google_review_opens for select to authenticated using (true);

-- Insert own rows only, so the record of who asked cannot be forged.
drop policy if exists "Staff can record asking" on public.google_review_opens;
create policy "Staff can record asking"
  on public.google_review_opens for insert to authenticated
  with check (auth.uid() = opened_by);

-- No update and no delete policy, deliberately. This is a log: a row that can
-- be quietly edited away is worth nothing as a guard against asking twice.
