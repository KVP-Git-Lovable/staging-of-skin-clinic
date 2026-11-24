-- The feedback form stops being written in JSX.
--
-- Three questions, hard-coded in two files that had to be kept in step by
-- hand: the clinic's Feedback tab and the patient portal. The clinic could not
-- change a word, add a question, or ask anything in a different style.
--
-- Now they are rows. The three that exist are seeded with their current
-- wording and their current behaviour, so the form renders identically the
-- moment this is applied and nothing changes until somebody changes it.
--
-- ── Why the two scores keep their own columns ──
--
-- patient_feedback.nps_score and .service_rating carry 1,200 records, every
-- report, the dashboard, and the root-cause cases. They stay exactly where
-- they are. The two built-in questions write to them AS WELL AS into answers,
-- so nothing that reads those columns has to know any of this happened, and
-- the build the clinic is running right now - which inserts those three
-- columns and nothing else - keeps working untouched.
--
-- ── Why every scoring question can open a case ──
--
-- The clinic asked for a threshold per question, not just for the two they
-- started with. score_at_or_below on the question row is that: null means this
-- question never opens a case, a number means an answer at or below it does.

create table if not exists public.feedback_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null check (length(btrim(question_text)) between 1 and 300),
  help_text text not null default '' check (length(help_text) <= 300),
  question_type text not null default 'stars'
    check (question_type in ('stars','emoji','scale_10','choice_one','choice_many','yes_no','text')),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_required boolean not null default false,
  -- null: this question never opens a root-cause case.
  score_at_or_below integer,
  -- The three the clinic started with. A built-in may be reworded, restyled,
  -- rethresholded and reordered, but not deleted: its answers are a column
  -- other screens read, and history would stop making sense without it.
  builtin text check (builtin is null or builtin in ('nps','service_rating','comments')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index if not exists feedback_questions_builtin_once
  on public.feedback_questions (builtin) where builtin is not null;
create index if not exists feedback_questions_order
  on public.feedback_questions (is_active, sort_order);

-- The form as it is worded today, so day one looks like day zero.
insert into public.feedback_questions (question_text, question_type, options, sort_order, is_required, score_at_or_below, builtin)
select * from (values
  ('How likely are you to recommend us to a friend or colleague?', 'scale_10', '{"min": 0, "max": 10}'::jsonb, 0, true, 6, 'nps'),
  ('How would you rate the overall quality of service?', 'stars', '{"max": 5}'::jsonb, 1, true, 3, 'service_rating'),
  ('Any comments or suggestions?', 'text', '{"maxLength": 2000}'::jsonb, 2, false, null, 'comments')
) as seed(question_text, question_type, options, sort_order, is_required, score_at_or_below, builtin)
where not exists (select 1 from public.feedback_questions where builtin is not null);

alter table public.feedback_questions enable row level security;
revoke all on public.feedback_questions from anon;
grant select, insert, update, delete on public.feedback_questions to authenticated;
revoke truncate, references, trigger on public.feedback_questions from authenticated;
grant all on public.feedback_questions to service_role;

drop policy if exists signed_in_must_be_staff on public.feedback_questions;
create policy signed_in_must_be_staff on public.feedback_questions
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- Any active staff member reads them: both feedback forms are built from this.
drop policy if exists feedback_questions_read on public.feedback_questions;
create policy feedback_questions_read on public.feedback_questions
  for select to authenticated using ((select public.is_active_staff()));

drop policy if exists feedback_questions_write on public.feedback_questions;
create policy feedback_questions_write on public.feedback_questions
  for insert to authenticated with check ((select public.is_admin_user()));
drop policy if exists feedback_questions_edit on public.feedback_questions;
create policy feedback_questions_edit on public.feedback_questions
  for update to authenticated
  using ((select public.is_admin_user())) with check ((select public.is_admin_user()));
-- Deleting is admin-only AND never a built-in. Enforced here rather than in a
-- screen, because a built-in's answers live in a column other reports read.
drop policy if exists feedback_questions_remove on public.feedback_questions;
create policy feedback_questions_remove on public.feedback_questions
  for delete to authenticated using ((select public.is_admin_user()) and builtin is null);

-- Answers to everything that is not one of the three built-ins, keyed by
-- question id. The built-ins are written here too, so one renderer can read
-- every answer the same way, but their columns remain the source of truth.
alter table public.patient_feedback add column if not exists answers jsonb not null default '{}'::jsonb;
alter table public.patient_feedback_revisions add column if not exists answers jsonb;

-- Every edit keeps the previous answer. This trigger compared and copied only
-- the three built-ins, so an edited extra answer would have been overwritten
-- with no revision behind it - exactly the loss patient_feedback_revisions
-- exists to prevent.
create or replace function public.snapshot_patient_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.nps_score is distinct from old.nps_score
     or new.service_rating is distinct from old.service_rating
     or new.comments is distinct from old.comments
     or new.answers is distinct from old.answers then
    insert into public.patient_feedback_revisions (
      feedback_id, appointment_id, patient_id,
      nps_score, service_rating, comments, answers,
      recorded_at, superseded_by
    ) values (
      old.id, old.appointment_id, old.patient_id,
      old.nps_score, old.service_rating, old.comments, old.answers,
      coalesce(old.updated_at, old.created_at), new.last_edited_by
    );
    new.updated_at := now();
  end if;
  return new;
end;
$fn$;

-- 'question' joins the three reasons a case can be opened for; the existing
-- rows keep theirs. Widening a CHECK accepts everything it accepted before.
alter table public.feedback_rca drop constraint if exists feedback_rca_opened_reason_check;
alter table public.feedback_rca add constraint feedback_rca_opened_reason_check
  check (opened_reason in ('nps', 'service_rating', 'both', 'question'));
alter table public.feedback_rca add column if not exists opened_question_id uuid;

-- The two built-ins still decide from their own columns, exactly as before.
-- Everything else is a configured scoring question, read out of answers.
create or replace function public.open_feedback_rca()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  _rca_id uuid;
  _reason text;
  _nps_limit integer;
  _rating_limit integer;
  _low_nps boolean;
  _low_rating boolean;
  _q record;
  _answer numeric;
  _question_id uuid;
begin
  select s.nps_at_or_below, s.rating_at_or_below
    into _nps_limit, _rating_limit
    from public.feedback_settings s
   where s.singleton;
  _nps_limit := coalesce(_nps_limit, 6);
  _rating_limit := coalesce(_rating_limit, 3);

  _low_nps := coalesce(new.nps_score, 10) <= _nps_limit;
  _low_rating := coalesce(new.service_rating, 5) <= _rating_limit;

  if _low_nps or _low_rating then
    _reason := case
      when _low_nps and _low_rating then 'both'
      when _low_nps then 'nps'
      else 'service_rating'
    end;
  else
    -- Any configured scoring question whose answer came in at or below its own
    -- limit. First match wins and names itself on the case; one low answer is
    -- reason enough and a second does not make a second case.
    for _q in
      select q.id, q.score_at_or_below
        from public.feedback_questions q
       where q.is_active
         and q.score_at_or_below is not null
         and q.builtin is null
       order by q.sort_order, q.id
    loop
      begin
        _answer := (new.answers ->> _q.id::text)::numeric;
      exception when others then
        _answer := null;
      end;
      if _answer is not null and _answer <= _q.score_at_or_below then
        _reason := 'question';
        _question_id := _q.id;
        exit;
      end if;
    end loop;
  end if;

  if _reason is null then
    return new;
  end if;

  if exists (select 1 from public.feedback_rca where feedback_id = new.id) then
    return new;
  end if;

  insert into public.feedback_rca (
    feedback_id, patient_id, opened_reason, opened_question_id,
    nps_score_at_open, service_rating_at_open, created_by
  ) values (
    new.id, new.patient_id, _reason, _question_id,
    new.nps_score, new.service_rating, public.current_staff_id()
  )
  returning id into _rca_id;

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
