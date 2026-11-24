-- Agentic Marketing: run log and guardrail settings. Safe to run more than once.
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  object text not null default 'patients',
  prompt text not null,
  status text not null default 'planned' check (status in ('planned','approved','rejected','failed')),
  plan jsonb,
  tool_calls jsonb not null default '[]'::jsonb,
  model text,
  journey_id uuid references public.comms_journeys(id) on delete set null,
  campaign_id uuid references public.social_campaigns(id) on delete set null,
  saved_view_id uuid references public.list_views(id) on delete set null,
  created_by uuid references public.staff(id) on delete set null,
  approved_by uuid references public.staff(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_created_idx on public.agent_runs (created_at desc);
create index if not exists agent_runs_created_by_idx on public.agent_runs (created_by, created_at desc);

create table if not exists public.comms_agent_settings (
  id boolean primary key default true check (id),
  audience_cap int not null default 1000 check (audience_cap > 0),
  send_window_start int not null default 9 check (send_window_start between 0 and 23),
  send_window_end int not null default 21 check (send_window_end between 1 and 24),
  ad_spend_cap numeric not null default 1500 check (ad_spend_cap >= 0),
  cost_per_message numeric not null default 0.85 check (cost_per_message >= 0),
  updated_by uuid references public.staff(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (send_window_end > send_window_start)
);
insert into public.comms_agent_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists agent_runs_updated_at on public.agent_runs;
create trigger agent_runs_updated_at before update on public.agent_runs for each row execute function public.comms_set_updated_at();

alter table public.agent_runs enable row level security;
alter table public.comms_agent_settings enable row level security;

-- Staff can read; every write goes through the comms-agent function (service role).
drop policy if exists "staff view agent runs" on public.agent_runs;
create policy "staff view agent runs" on public.agent_runs for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff view agent settings" on public.comms_agent_settings;
create policy "staff view agent settings" on public.comms_agent_settings for select to authenticated using (public.current_staff_id() is not null);

grant select on public.agent_runs, public.comms_agent_settings to authenticated;
grant all on public.agent_runs, public.comms_agent_settings to service_role;