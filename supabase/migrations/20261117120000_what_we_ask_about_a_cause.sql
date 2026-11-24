-- Root causes the clinic owns, and the questions that follow from each.
--
-- A case had one cause, picked from nine written into a CHECK constraint, and
-- nothing else to fill in. The clinic asked for three things: a cause list
-- they can edit, more than one cause on a case, and questions that appear
-- based on the cause chosen - "waiting time" and "communication" are not
-- answered by the same follow-up.
--
-- ── Nothing changes until somebody changes it ──
--
-- rca_root_causes is seeded with exactly the nine codes and labels that were
-- in the constraint, so the picker looks the same and the two cases that
-- already carry a cause keep it. The build the clinic is running right now
-- writes feedback_rca.root_cause and reads it back; that column stays, and a
-- trigger keeps it in step with the new list whichever side wrote.

create table if not exists public.rca_root_causes (
  id uuid primary key default gen_random_uuid(),
  -- Stable. feedback_rca.root_cause stores this, and old cases are read by it.
  code text not null unique check (code ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (length(btrim(label)) between 1 and 120),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.rca_root_causes (code, label, sort_order)
select * from (values
  ('waiting_time', 'Waiting time', 0),
  ('cost', 'Cost or billing', 1),
  ('treatment_result', 'Treatment result', 2),
  ('staff_behaviour', 'Staff behaviour', 3),
  ('communication', 'Communication or explanation', 4),
  ('scheduling', 'Appointment scheduling', 5),
  ('facility', 'Facility or comfort', 6),
  ('product_availability', 'Product availability', 7),
  ('other', 'Other', 8)
) as seed(code, label, sort_order)
on conflict (code) do nothing;

-- What to ask once that cause is chosen. Same answer types as the feedback
-- form, so one set of controls draws both and a type added later works in both.
create table if not exists public.rca_questions (
  id uuid primary key default gen_random_uuid(),
  cause_id uuid not null references public.rca_root_causes(id) on delete cascade,
  question_text text not null check (length(btrim(question_text)) between 1 and 300),
  help_text text not null default '' check (length(help_text) <= 300),
  question_type text not null default 'text'
    check (question_type in ('stars','emoji','scale_10','choice_one','choice_many','yes_no','text')),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_required boolean not null default false,
  -- Written by the AI suggestion flow, kept so the clinic can see which
  -- wording it accepted rather than wrote.
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create index if not exists rca_questions_by_cause on public.rca_questions (cause_id, is_active, sort_order);

-- More than one cause, and the answers to their questions.
alter table public.feedback_rca add column if not exists root_causes text[] not null default '{}'::text[];
alter table public.feedback_rca add column if not exists answers jsonb not null default '{}'::jsonb;

-- The nine were a CHECK. They are a table now, so the constraint goes and a
-- trigger validates against the table instead - identical on day one, because
-- the table holds exactly those nine codes.
alter table public.feedback_rca drop constraint if exists feedback_rca_root_cause_check;

create or replace function public.sync_rca_root_causes()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare _bad text;
begin
  -- Whichever side wrote, the other follows. The published build sets only
  -- root_cause; this build sets root_causes. Neither has to know about the
  -- other, and a case read by either is never half-filled.
  if new.root_causes is distinct from coalesce(old.root_causes, '{}'::text[]) and array_length(new.root_causes, 1) > 0 then
    new.root_cause := new.root_causes[1];
  elsif new.root_cause is not null and not (new.root_cause = any(new.root_causes)) then
    new.root_causes := array[new.root_cause];
  elsif new.root_cause is null and array_length(new.root_causes, 1) is null then
    new.root_causes := '{}'::text[];
  end if;

  -- Every cause has to be one the clinic actually has. A retired cause is
  -- still valid: it may be on a case that was worked months ago.
  select c into _bad
    from unnest(coalesce(new.root_causes, '{}'::text[])) as c
   where not exists (select 1 from public.rca_root_causes r where r.code = c)
   limit 1;
  if _bad is not null then
    raise exception 'Unknown root cause "%"', _bad;
  end if;

  return new;
end;
$fn$;

drop trigger if exists feedback_rca_sync_causes on public.feedback_rca;
create trigger feedback_rca_sync_causes
  before insert or update on public.feedback_rca
  for each row execute function public.sync_rca_root_causes();

-- Bring the cases that already carry a cause into the new column.
update public.feedback_rca
   set root_causes = array[root_cause]
 where root_cause is not null and array_length(root_causes, 1) is null;

alter table public.rca_root_causes enable row level security;
alter table public.rca_questions enable row level security;
revoke all on public.rca_root_causes from anon;
revoke all on public.rca_questions from anon;
grant select, insert, update, delete on public.rca_root_causes to authenticated;
grant select, insert, update, delete on public.rca_questions to authenticated;
revoke truncate, references, trigger on public.rca_root_causes from authenticated;
revoke truncate, references, trigger on public.rca_questions from authenticated;
grant all on public.rca_root_causes to service_role;
grant all on public.rca_questions to service_role;

do $$
declare t text;
begin
  foreach t in array array['rca_root_causes', 'rca_questions'] loop
    execute format('drop policy if exists signed_in_must_be_staff on public.%I', t);
    execute format(
      'create policy signed_in_must_be_staff on public.%I as restrictive for all to authenticated '
      || 'using ((select public.is_active_staff())) with check ((select public.is_active_staff()))', t);
    -- Read by anyone who may work a case, because the detail screen draws the
    -- picker and the follow-up questions from these.
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_manage_feedback_rca())',
      t || '_read', t);
    -- Changed by an admin: this is what the clinic measures itself by.
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.is_admin_user()))',
      t || '_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_edit', t);
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using ((select public.is_admin_user())) with check ((select public.is_admin_user()))',
      t || '_edit', t);
    execute format('drop policy if exists %I on public.%I', t || '_remove', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.is_admin_user()))',
      t || '_remove', t);
  end loop;
end $$;
