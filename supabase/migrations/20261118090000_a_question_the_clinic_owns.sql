-- A survey question the clinic owns.
--
-- The portal shows a photo above each question, which looks like the clinic's
-- choice. It is not. SurveyQuestionImage picks one of 37 pictures bundled into
-- the build by keyword-matching the question's own text (illustrationFor in
-- src/lib/surveyIllustration.ts), so rewording a question silently changes its
-- picture and nobody can choose one.
--
-- A question could hold only this:
--
--   question_text · question_type · options · ideal_answer · sort_order
--
-- No picture, no help text, no way to say an answer is optional, no limits,
-- and no way to retire one without deleting the answers given to it. The
-- template had no layout settings either, so the portal asked one question at
-- a time because that was the only thing it could do.
--
-- ── Nothing changes until somebody changes it ──
--
-- Every column here carries a default that reproduces today's behaviour
-- exactly: no picture (fall back to the illustration), no help text, required
-- (every question is required today), no limits, active, and one question per
-- page. A template nobody edits reads and renders precisely as it does now.
--
-- Backward-compatible throughout: new columns with defaults, no rename, no
-- drop, nothing NOT NULL without one. The published build at
-- clinic.quickapp.ai inserts five columns and goes on working with no deploy.

-- ── 1. What a question can hold ──

alter table public.survey_questions
  -- The clinic's own picture, as a public URL. Public because the patient
  -- portal is not a Supabase-auth app (src/lib/portalApi.ts) - a patient has
  -- no session to sign a URL with. Null means "use the bundled illustration",
  -- which is what all 58 existing questions do.
  add column if not exists image_url text,
  add column if not exists help_text text not null default '',
  -- True, because today every question must be answered: the portal's Next is
  -- disabled until it is. Keeping that default means no form loosens by itself.
  add column if not exists is_required boolean not null default true,
  -- Null is no limit, which is today's behaviour for both.
  add column if not exists max_choices integer,
  add column if not exists max_length integer,
  -- Retire a question instead of deleting it. The answers already given to it
  -- stay in survey_responses.answers and keep reading correctly.
  add column if not exists is_active boolean not null default true;

alter table public.survey_questions
  drop constraint if exists survey_questions_max_choices_check;
alter table public.survey_questions
  add constraint survey_questions_max_choices_check
  check (max_choices is null or max_choices between 1 and 50);

alter table public.survey_questions
  drop constraint if exists survey_questions_max_length_check;
alter table public.survey_questions
  add constraint survey_questions_max_length_check
  check (max_length is null or max_length between 1 and 5000);

comment on column public.survey_questions.image_url is
  'The clinic''s own picture for this question, a public URL in the survey-images bucket. Null falls back to the keyword-matched illustration bundled in the build.';
comment on column public.survey_questions.is_active is
  'False retires the question: it stops being asked, and the answers already given to it are kept.';

-- ── 2. How many are asked at once ──
--
-- One is exactly what the portal does today, so a template nobody touches is
-- unchanged. Capped at five because the portal asks on a phone.

alter table public.survey_templates
  add column if not exists questions_per_page integer not null default 1;

alter table public.survey_templates
  drop constraint if exists survey_templates_questions_per_page_check;
alter table public.survey_templates
  add constraint survey_templates_questions_per_page_check
  check (questions_per_page between 1 and 5);

-- ── 3. Where the pictures live ──
--
-- Public, for the reason given above. Same shape as product-images, which the
-- pharmacy screen already uploads to.

insert into storage.buckets (id, name, public, file_size_limit)
values ('survey-images', 'survey-images', true, 5242880)
on conflict (id) do update
  set public = true, file_size_limit = 5242880;

-- Anyone may look at a survey picture - the portal shows it to a patient who
-- has no Supabase session. Only staff may put one there or remove it.

drop policy if exists "survey images are public" on storage.objects;
create policy "survey images are public"
  on storage.objects for select
  using (bucket_id = 'survey-images');

drop policy if exists "staff manage survey images" on storage.objects;
create policy "staff manage survey images"
  on storage.objects for all to authenticated
  using (bucket_id = 'survey-images' and (select public.is_active_staff()))
  with check (bucket_id = 'survey-images' and (select public.is_active_staff()));
