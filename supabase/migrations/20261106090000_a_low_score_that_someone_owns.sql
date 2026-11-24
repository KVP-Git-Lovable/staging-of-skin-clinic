-- A low feedback score becomes a case somebody owns.
--
-- Today the clinic collects feedback well - 979 responses covering 52% of
-- appointments since 24 September - and then nothing happens to the bad ones.
-- There is no feedback list page, no low-score query and no alert anywhere in
-- the app. In those six weeks 24 responses came in at NPS <= 6 or a service
-- rating <= 3, and exactly 3 of them left any comment at all: 20, 4 and 4
-- characters. Two dozen unhappy patients, and no record of why for any of
-- them.
--
-- This adds the missing half: the score opens a case, a named person works
-- it, and closing it records a reason the clinic can count.
--
-- PUBLISHED-BUILD SAFETY (AGENTS.md). Purely additive - two new tables, three
-- new functions, two new triggers. No column renamed or dropped, no new NOT
-- NULL without a default, and no second foreign key between tables that are
-- already embedded. The build serving clinic.quickapp.ai today does not know
-- any of this exists and keeps working untouched.
--
-- NOT FOR PATIENTS. Everything here is staff discussing a complaint, often
-- naming a colleague, about a patient who can sign into the portal and read
-- their own feedback. anon gets no grant on either table, and read is gated
-- on an admin/doctor predicate so an authenticated receptionist cannot see it
-- either.

-- ---------------------------------------------------------------------------
-- The one rule for "this needs looking into"
-- ---------------------------------------------------------------------------

-- The single authority on the threshold. The trigger below uses it, the
-- backfill uses it, and needsRootCause() in src/lib/feedbackScores.ts mirrors
-- it - feedbackRca.test.ts reads this file and fails if the two drift.
--
-- `<= 3` on the rating is deliberate and is wider than the app's own "Poor".
-- ratingLabel() in feedbackScores.ts calls 3 "Average", but a 3 out of 5 is
-- not a happy patient. The clinic chose this line knowing it means ~4 cases a
-- week rather than ~3.
--
-- Both scores, not just NPS, because the live data contradicts itself: one
-- patient gave NPS 8 with a service rating of 1, another NPS 1 with a rating
-- of 5. Either rule alone misses one of them.
create or replace function public.feedback_needs_root_cause(_nps integer, _rating integer)
returns boolean
language sql
immutable
as $fn$
  select coalesce(_nps, 10) <= 6 or coalesce(_rating, 5) <= 3;
$fn$;

-- Who may work a case. Its own predicate rather than a reuse of
-- can_manage_knowledge(), which has an identical body today but a name that
-- would be a lie here - and the two are free to diverge later.
create or replace function public.can_manage_feedback_rca()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
      from public.staff s
      join public.user_roles_config r on r.id = s.role_id
     where s.auth_user_id = auth.uid()
       and s.is_active is not false
       and lower(r.name) in ('admin', 'doctor')
  );
$fn$;
revoke all on function public.can_manage_feedback_rca() from public;
grant execute on function public.can_manage_feedback_rca() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The case
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_rca (
  id uuid primary key default gen_random_uuid(),

  -- One case per piece of feedback. The discussion is the list that grows
  -- (feedback_rca_comments); a second case for the same complaint would make
  -- "what was the root cause" ambiguous.
  feedback_id uuid not null unique references public.patient_feedback(id) on delete cascade,

  -- Denormalised, with no foreign key, exactly as patient_feedback.patient_id
  -- is - so the two agree and a patient's cases can be found without a join.
  patient_id uuid not null,

  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'no_action')),

  -- Null until someone closes the case. The picklist is mirrored in
  -- src/lib/feedbackRca.ts; a test fails if the two lists drift.
  root_cause text
    check (root_cause is null or root_cause in (
      'waiting_time', 'cost', 'treatment_result', 'staff_behaviour',
      'communication', 'scheduling', 'facility', 'product_availability', 'other'
    )),
  resolution_note text,

  -- Why it opened, and the scores as they were at that moment. The patient can
  -- edit their own feedback from the portal, so the live row may no longer say
  -- what caused the case to exist.
  opened_reason text not null check (opened_reason in ('nps', 'service_rating', 'both')),
  nps_score_at_open integer not null,
  service_rating_at_open integer not null,

  assigned_to uuid references public.staff(id) on delete set null,
  resolved_by uuid references public.staff(id) on delete set null,
  resolved_at timestamptz,
  created_by uuid references public.staff(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- THREE routes from feedback_rca to staff (assigned_to, resolved_by,
-- created_by), so an implicit `staff(...)` embed from this table is ambiguous
-- and PostgREST refuses it outright. The pair is registered in
-- src/lib/ambiguousEmbeds.test.ts and every embed names its constraint.
create index if not exists feedback_rca_status_idx on public.feedback_rca (status, created_at desc);
create index if not exists feedback_rca_patient_idx on public.feedback_rca (patient_id);
create index if not exists feedback_rca_assigned_idx on public.feedback_rca (assigned_to) where assigned_to is not null;

alter table public.feedback_rca enable row level security;
revoke all on public.feedback_rca from anon;
grant select, insert, update on public.feedback_rca to authenticated;
-- This database has default privileges that hand `authenticated` every
-- privilege on a new table, so the grant above ADDS to delete and truncate
-- rather than describing the whole set. Verified on the live database: without
-- these revokes authenticated held DELETE, TRUNCATE, REFERENCES and TRIGGER
-- here too. RLS would still have refused the statement - there is no delete
-- policy - but a privilege nothing needs should not be sitting there as the
-- only thing between a mistake and a deleted investigation.
revoke delete, truncate, references, trigger on public.feedback_rca from authenticated;
grant all on public.feedback_rca to service_role;

-- No delete grant and no delete policy: a complaint that was investigated is a
-- record, not a draft. Closing it as 'no_action' is how you say it needed none.
create policy feedback_rca_read on public.feedback_rca
  for select to authenticated using (public.can_manage_feedback_rca());
create policy feedback_rca_write on public.feedback_rca
  for insert to authenticated with check (public.can_manage_feedback_rca());
create policy feedback_rca_edit on public.feedback_rca
  for update to authenticated using (public.can_manage_feedback_rca())
  with check (public.can_manage_feedback_rca());

-- ---------------------------------------------------------------------------
-- The discussion
-- ---------------------------------------------------------------------------

create table if not exists public.feedback_rca_comments (
  id uuid primary key default gen_random_uuid(),
  rca_id uuid not null references public.feedback_rca(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  author_name text not null default '',
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists feedback_rca_comments_rca_idx
  on public.feedback_rca_comments (rca_id, created_at desc);

alter table public.feedback_rca_comments enable row level security;
revoke all on public.feedback_rca_comments from anon;
-- Append-only by grant, like knowledge_article_comments and field_history:
-- there is no update or delete path for anyone, so what the team recorded
-- after phoning a patient cannot later be tidied up.
grant select, insert on public.feedback_rca_comments to authenticated;
-- Same reason as above, and it matters more here: "append-only by grant" is
-- the whole promise of this table, and the default privileges quietly broke it.
revoke update, delete, truncate, references, trigger on public.feedback_rca_comments from authenticated;
grant all on public.feedback_rca_comments to service_role;

create policy feedback_rca_comments_read on public.feedback_rca_comments
  for select to authenticated using (public.can_manage_feedback_rca());
create policy feedback_rca_comments_write on public.feedback_rca_comments
  for insert to authenticated with check (public.can_manage_feedback_rca());

-- The author is stamped here, not accepted from the client, so a comment
-- cannot be posted under someone else's name.
create or replace function public.feedback_rca_comment_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  new.author_id := auth.uid();
  new.created_at := clock_timestamp();
  select coalesce(nullif(btrim(concat_ws(' ', first_name, last_name)), ''), 'Staff member')
    into new.author_name
    from public.staff
   where auth_user_id = auth.uid()
   limit 1;
  new.author_name := coalesce(new.author_name, 'Staff member');
  return new;
end;
$fn$;

drop trigger if exists feedback_rca_comment_stamp on public.feedback_rca_comments;
create trigger feedback_rca_comment_stamp
  before insert on public.feedback_rca_comments
  for each row execute function public.feedback_rca_comment_stamp();

create or replace function public.feedback_rca_touch()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  new.updated_at := now();
  -- Stamped here rather than trusted from the screen, so "who closed this"
  -- is reliable whichever path did it.
  if new.status in ('resolved', 'no_action') and old.status not in ('resolved', 'no_action') then
    new.resolved_by := public.current_staff_id();
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'no_action') then
    new.resolved_by := null;
    new.resolved_at := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists feedback_rca_touch on public.feedback_rca;
create trigger feedback_rca_touch
  before update on public.feedback_rca
  for each row execute function public.feedback_rca_touch();

-- ---------------------------------------------------------------------------
-- Opening a case, automatically
-- ---------------------------------------------------------------------------

create or replace function public.open_feedback_rca()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _rca_id uuid;
  _reason text;
begin
  if not public.feedback_needs_root_cause(new.nps_score, new.service_rating) then
    return new;
  end if;

  -- Already has a case. Note what this means on UPDATE: a case is opened once
  -- and never re-opened or duplicated by later edits.
  if exists (select 1 from public.feedback_rca where feedback_id = new.id) then
    return new;
  end if;

  _reason := case
    when new.nps_score <= 6 and new.service_rating <= 3 then 'both'
    when new.nps_score <= 6 then 'nps'
    else 'service_rating'
  end;

  insert into public.feedback_rca (
    feedback_id, patient_id, opened_reason, nps_score_at_open, service_rating_at_open, created_by
  ) values (
    new.id, new.patient_id, _reason, new.nps_score, new.service_rating, public.current_staff_id()
  )
  returning id into _rca_id;

  -- Tell the admins. Nothing watches for a bad score today, which is how 24 of
  -- them went by unnoticed. Suppressed during the backfill below, which would
  -- otherwise deliver two dozen notifications at once for history.
  if coalesce(current_setting('app.rca_backfill', true), '') <> 'on' then
    insert into public.notifications (user_id, title, body, object_type, record_id, link, created_by)
    select s.auth_user_id,
           'Low feedback score needs review',
           coalesce(nullif(btrim(new.patient_name), ''), 'A patient')
             || ' rated the visit ' || new.nps_score || '/10 and ' || new.service_rating || '/5.',
           'feedback_rca',
           _rca_id,
           '/feedback-rca/' || _rca_id,
           auth.uid()
      from public.staff s
      join public.user_roles_config r on r.id = s.role_id
     where s.is_active is not false
       and s.auth_user_id is not null
       and lower(r.name) = 'admin';
  end if;

  return new;
end;
$fn$;

-- AFTER, and on UPDATE as well as INSERT: a patient can lower their own score
-- from the portal, and that is exactly a case worth opening. It never closes a
-- case - if they later raise the score the case stays open for a human, because
-- by then the team may already have phoned them and discarding that would throw
-- away the record of a real conversation.
drop trigger if exists patient_feedback_open_rca on public.patient_feedback;
create trigger patient_feedback_open_rca
  after insert or update on public.patient_feedback
  for each row execute function public.open_feedback_rca();

-- ---------------------------------------------------------------------------
-- The 24 already sitting there
-- ---------------------------------------------------------------------------

-- Backfilled through the trigger itself rather than with a second INSERT that
-- repeats the rule - the same reason recalc_patient_invoice_rollups is used for
-- its own backfill in 20261104170000. A no-op update fires the AFTER trigger;
-- the BEFORE snapshot trigger writes no revision because no score or comment
-- changed, so no patient's feedback history is touched.
do $bf$
begin
  perform set_config('app.rca_backfill', 'on', true);
  update public.patient_feedback
     set updated_at = updated_at
   where public.feedback_needs_root_cause(nps_score, service_rating);
  perform set_config('app.rca_backfill', 'off', true);
end;
$bf$;

-- ---------------------------------------------------------------------------
-- Reachable for the roles that may use it
-- ---------------------------------------------------------------------------

-- ProtectedRoute in src/App.tsx denies a brand-new module key to any non-admin
-- role that already has permission rows, so without this seed a Doctor would
-- see the sidebar link and hit AccessDenied. Admin and Doctor only, matching
-- can_manage_feedback_rca(); an admin can widen it in User Management.
-- ON CONFLICT DO NOTHING so re-running never overwrites a later choice.
insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'feedback_rca', true, true, true, false
  from public.user_roles_config r
 where lower(r.name) in ('admin', 'doctor')
on conflict (role_id, module_key) do nothing;

comment on table public.feedback_rca is
  'One root-cause case per low-scoring patient_feedback row. Internal only - never exposed to the patient portal.';
comment on table public.feedback_rca_comments is
  'Append-only discussion on a root-cause case. No update or delete grant exists for any role.';
