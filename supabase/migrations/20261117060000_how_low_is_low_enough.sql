-- How low a score has to be before somebody owns it.
--
-- A Root Cause Analysis case opens by itself when feedback is low, and "low"
-- was written into the database: NPS <= 6 or service rating <= 3. Across the
-- clinic's 1,199 feedback records that rule has opened 28 cases. Changing it
-- meant a migration, which means it never changed.
--
-- Worse, the numbers were in TWO executable places: feedback_needs_root_cause,
-- which decides whether to open a case, and a second copy inside
-- open_feedback_rca, which decides whether the case is labelled 'nps',
-- 'service_rating' or 'both'. Editing one and not the other would have opened
-- cases with the wrong reason on them.
--
-- Now: one row, read once per decision, and the classifier uses the same two
-- variables as the gate.
--
-- ── Nothing changes the moment this is applied ──
--
-- The defaults are exactly the numbers that were hardcoded. The build the
-- clinic is running right now neither reads this table nor calls these
-- functions directly - the trigger does - so applying this changes no
-- behaviour at all until an admin edits the row.
--
-- A change applies to feedback recorded or edited from that moment on. There is
-- no sweep over history: the trigger fires on insert and update, so nothing
-- retroactive happens, 28 cases stay 28, and an admin can put a number back
-- without a crowd of cases appearing and disappearing.

create table if not exists public.feedback_settings (
  singleton boolean primary key default true check (singleton),
  nps_at_or_below integer not null default 6 check (nps_at_or_below between 0 and 10),
  rating_at_or_below integer not null default 3 check (rating_at_or_below between 1 and 5),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.feedback_settings (singleton) values (true) on conflict (singleton) do nothing;

alter table public.feedback_settings enable row level security;
revoke all on public.feedback_settings from anon;
grant select, update on public.feedback_settings to authenticated;
revoke insert, delete, truncate, references, trigger on public.feedback_settings from authenticated;
grant all on public.feedback_settings to service_role;

-- Clinic data is staff-only at the database, and a table's own policies never
-- rest on that one rule alone - see AGENTS.md.
drop policy if exists signed_in_must_be_staff on public.feedback_settings;
create policy signed_in_must_be_staff on public.feedback_settings
  as restrictive for all to authenticated
  using ((select public.is_active_staff()))
  with check ((select public.is_active_staff()));

-- Any active staff member may READ it: the RCA worklist says which rule it is
-- working to, and a worklist that cannot tell you why these cases and not
-- others is one you have to take on faith.
drop policy if exists feedback_settings_read on public.feedback_settings;
create policy feedback_settings_read on public.feedback_settings
  for select to authenticated
  using ((select public.is_active_staff()));

-- Only an admin may CHANGE it. This decides which patients get chased after a
-- bad visit, which is a clinic policy decision, not a preference.
drop policy if exists feedback_settings_edit on public.feedback_settings;
create policy feedback_settings_edit on public.feedback_settings
  for update to authenticated
  using ((select public.is_admin_user()))
  with check ((select public.is_admin_user()));

-- STABLE, not IMMUTABLE. It reads a table now, and an immutable function is one
-- Postgres is entitled to cache the answer of - which would hand back yesterday's
-- threshold. Only the trigger and the one-time backfill call it, so nothing
-- depends on the old volatility.
create or replace function public.feedback_needs_root_cause(_nps integer, _rating integer)
returns boolean
language sql
stable
set search_path = public
as $fn$
  select coalesce(_nps, 10) <= s.nps_at_or_below
      or coalesce(_rating, 5) <= s.rating_at_or_below
    from public.feedback_settings s
   where s.singleton;
$fn$;

-- The classifier no longer repeats the numbers: both decisions come from one
-- read of the row. Everything else here is deliberately unchanged - it still
-- fires on insert and update so a patient lowering their own score from the
-- portal opens a case, still opens at most one case per feedback row, still
-- never closes or re-opens one, and still notifies every active admin.
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
begin
  select s.nps_at_or_below, s.rating_at_or_below
    into _nps_limit, _rating_limit
    from public.feedback_settings s
   where s.singleton;

  -- Defensive: if the row were ever missing, fall back to the numbers this
  -- migration shipped rather than opening a case for every visit.
  _nps_limit := coalesce(_nps_limit, 6);
  _rating_limit := coalesce(_rating_limit, 3);

  _low_nps := coalesce(new.nps_score, 10) <= _nps_limit;
  _low_rating := coalesce(new.service_rating, 5) <= _rating_limit;

  if not (_low_nps or _low_rating) then
    return new;
  end if;

  if exists (select 1 from public.feedback_rca where feedback_id = new.id) then
    return new;
  end if;

  _reason := case
    when _low_nps and _low_rating then 'both'
    when _low_nps then 'nps'
    else 'service_rating'
  end;

  insert into public.feedback_rca (
    feedback_id, patient_id, opened_reason, nps_score_at_open, service_rating_at_open, created_by
  ) values (
    new.id, new.patient_id, _reason, new.nps_score, new.service_rating, public.current_staff_id()
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
