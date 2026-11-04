-- A pinned list view belongs to the person who pinned it.
--
-- list_views.is_default was a single boolean on a row that may be shared with
-- the whole clinic (visibility = 'everyone'), so it could never hold more than
-- one person's preference. "Todays Appointments" belongs to one user, who
-- pinned it; everybody else opened the views menu, saw that row already
-- flagged as their default, pressed the pin to set it - and the UI read that
-- press as "unpin", cleared nothing, moved them to All Appointments and told
-- them All Appointments had been pinned. Reported as "even if we pin this
-- today's view it doesn't stay there when we come back from another tab".
--
-- The pin becomes a row of its own, one per person per module. It holds a
-- list_views id or one of the standard view ids ('__all__', '__recent__'),
-- which have no database row of their own - hence text rather than uuid and no
-- foreign key to list_views. A deleted view leaves a pin that no longer
-- resolves; the app falls back to All rather than failing (see
-- src/lib/listViews/pickActiveView.ts).
--
-- list_views.is_default is deliberately left in place and untouched. Nothing is
-- dropped or rewritten here; the app simply stops reading it.

create table if not exists public.list_view_defaults (
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null,
  view_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

alter table public.list_view_defaults enable row level security;

-- Own rows only, in all four directions. A pin is a personal preference: there
-- is no reason for anyone to read, let alone change, somebody else's.
drop policy if exists "Users can read their own default view" on public.list_view_defaults;
create policy "Users can read their own default view"
  on public.list_view_defaults for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can set their own default view" on public.list_view_defaults;
create policy "Users can set their own default view"
  on public.list_view_defaults for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can change their own default view" on public.list_view_defaults;
create policy "Users can change their own default view"
  on public.list_view_defaults for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can clear their own default view" on public.list_view_defaults;
create policy "Users can clear their own default view"
  on public.list_view_defaults for delete to authenticated
  using (auth.uid() = user_id);

-- Carry over the pins people already have, so nobody's landing view changes on
-- the day this ships. One per person per module - a user with two flagged rows
-- in the same section (nothing stopped that) keeps the most recently updated.
insert into public.list_view_defaults (user_id, section, view_id, updated_at)
select distinct on (user_id, section) user_id, section, id::text, updated_at
  from public.list_views
 where is_default
 order by user_id, section, updated_at desc
on conflict (user_id, section) do nothing;
