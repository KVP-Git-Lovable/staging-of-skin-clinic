create table if not exists public.comms_journeys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused')),
  canvas_data jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  audience_config jsonb,
  approval_status text not null default 'draft' check (approval_status in ('draft','pending','approved','rejected')),
  approver_id uuid references public.staff(id) on delete set null,
  submitted_by uuid references public.staff(id) on delete set null,
  submitted_at timestamptz,
  approved_at timestamptz,
  rejection_reason text,
  approval_notes text,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comms_journeys_approval_idx on public.comms_journeys (approval_status, approver_id);
create index if not exists comms_journeys_status_idx on public.comms_journeys (status);

create table if not exists public.comms_journey_schedules (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null unique references public.comms_journeys(id) on delete cascade,
  type text not null check (type in ('one_time','recurring')),
  frequency text check (frequency in ('daily','weekly','monthly','quarterly')),
  execution_date date,
  execution_time time,
  days_of_week int[],
  day_of_month int check (day_of_month between 1 and 31),
  month_of_quarter int check (month_of_quarter between 1 and 3),
  timezone text not null default 'Asia/Kolkata',
  next_run_at timestamptz,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comms_journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.comms_journeys(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  current_node_id text,
  status text not null default 'active' check (status in ('active','pending_delivery','completed','failed')),
  enrolled_at timestamptz not null default now(),
  next_action_at timestamptz,
  retry_count int not null default 0,
  unique (journey_id, patient_id)
);
create index if not exists comms_journey_enrollments_due_idx on public.comms_journey_enrollments (next_action_at) where status in ('active','pending_delivery');

create table if not exists public.comms_journey_message_log (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.comms_journeys(id) on delete cascade,
  enrollment_id uuid references public.comms_journey_enrollments(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  node_id text,
  channel text not null default 'whatsapp',
  template_id uuid references public.comms_whatsapp_templates(id) on delete set null,
  status text not null default 'queued',
  twilio_message_sid text,
  delivery_status text,
  error_code text,
  error_message text,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, node_id, channel)
);
create index if not exists comms_journey_message_log_sid_idx on public.comms_journey_message_log (twilio_message_sid);
create index if not exists comms_journey_message_log_journey_idx on public.comms_journey_message_log (journey_id);

create or replace function public.comms_validate_journey_schedule() returns trigger language plpgsql as $$
begin
  if new.execution_time is null then raise exception 'A run time is required'; end if;
  if new.type = 'one_time' then
    if new.execution_date is null then raise exception 'A date is required for a one-time schedule'; end if;
  else
    if new.frequency is null then raise exception 'A frequency is required for a recurring schedule'; end if;
    if new.frequency = 'weekly' and coalesce(array_length(new.days_of_week, 1), 0) = 0 then raise exception 'Pick at least one weekday'; end if;
    if new.frequency in ('monthly','quarterly') and new.day_of_month is null then raise exception 'A day of the month is required'; end if;
    if new.frequency = 'quarterly' and new.month_of_quarter is null then raise exception 'A month of the quarter is required'; end if;
  end if;
  return new;
end $$;
drop trigger if exists comms_journey_schedules_validate on public.comms_journey_schedules;
create trigger comms_journey_schedules_validate before insert or update on public.comms_journey_schedules for each row execute function public.comms_validate_journey_schedule();
drop trigger if exists comms_journey_schedules_updated_at on public.comms_journey_schedules;
create trigger comms_journey_schedules_updated_at before update on public.comms_journey_schedules for each row execute function public.comms_set_updated_at();
drop trigger if exists comms_journeys_updated_at on public.comms_journeys;
create trigger comms_journeys_updated_at before update on public.comms_journeys for each row execute function public.comms_set_updated_at();

create or replace function public.comms_journeys_guard() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then
      new.status := 'draft'; new.approval_status := 'draft'; new.approver_id := null; new.submitted_by := null;
      new.submitted_at := null; new.approved_at := null; new.rejection_reason := null; new.approval_notes := null;
    else
      if new.status is distinct from old.status
         or new.approval_status is distinct from old.approval_status
         or new.approver_id is distinct from old.approver_id
         or new.submitted_by is distinct from old.submitted_by
         or new.submitted_at is distinct from old.submitted_at
         or new.approved_at is distinct from old.approved_at
         or new.rejection_reason is distinct from old.rejection_reason
         or new.approval_notes is distinct from old.approval_notes then
        raise exception 'Journey status and approval can only be changed through the approval workflow';
      end if;
      if new.canvas_data is distinct from old.canvas_data or new.audience_config is distinct from old.audience_config then
        if old.status = 'active' then raise exception 'Pause the journey before editing it'; end if;
        if old.approval_status = 'pending' then raise exception 'This journey is awaiting approval and cannot be edited'; end if;
        if old.approval_status = 'approved' then
          new.approval_status := 'draft'; new.approver_id := null; new.approved_at := null;
          new.submitted_at := null; new.submitted_by := null;
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comms_journeys_guard on public.comms_journeys;
create trigger comms_journeys_guard before insert or update on public.comms_journeys for each row execute function public.comms_journeys_guard();

alter table public.comms_journeys enable row level security;
alter table public.comms_journey_schedules enable row level security;
alter table public.comms_journey_enrollments enable row level security;
alter table public.comms_journey_message_log enable row level security;

drop policy if exists "staff view journeys" on public.comms_journeys;
create policy "staff view journeys" on public.comms_journeys for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff create journeys" on public.comms_journeys;
create policy "staff create journeys" on public.comms_journeys for insert to authenticated with check (created_by = public.current_staff_id());
drop policy if exists "owner or full-scope update journeys" on public.comms_journeys;
create policy "owner or full-scope update journeys" on public.comms_journeys for update to authenticated using (created_by = public.current_staff_id() or public.has_full_data_scope());
drop policy if exists "owner or full-scope delete inactive journeys" on public.comms_journeys;
create policy "owner or full-scope delete inactive journeys" on public.comms_journeys for delete to authenticated using ((created_by = public.current_staff_id() or public.has_full_data_scope()) and status <> 'active');

drop policy if exists "staff view schedules" on public.comms_journey_schedules;
create policy "staff view schedules" on public.comms_journey_schedules for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "owner schedules insert" on public.comms_journey_schedules;
create policy "owner schedules insert" on public.comms_journey_schedules for insert to authenticated with check (exists (select 1 from public.comms_journeys j where j.id = journey_id and j.status <> 'active' and j.approval_status <> 'pending' and (j.created_by = public.current_staff_id() or public.has_full_data_scope())));
drop policy if exists "owner schedules update" on public.comms_journey_schedules;
create policy "owner schedules update" on public.comms_journey_schedules for update to authenticated using (exists (select 1 from public.comms_journeys j where j.id = journey_id and j.status <> 'active' and j.approval_status <> 'pending' and (j.created_by = public.current_staff_id() or public.has_full_data_scope())));
drop policy if exists "owner schedules delete" on public.comms_journey_schedules;
create policy "owner schedules delete" on public.comms_journey_schedules for delete to authenticated using (exists (select 1 from public.comms_journeys j where j.id = journey_id and j.status <> 'active' and j.approval_status <> 'pending' and (j.created_by = public.current_staff_id() or public.has_full_data_scope())));

drop policy if exists "staff view enrollments" on public.comms_journey_enrollments;
create policy "staff view enrollments" on public.comms_journey_enrollments for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff view message log" on public.comms_journey_message_log;
create policy "staff view message log" on public.comms_journey_message_log for select to authenticated using (public.current_staff_id() is not null);

grant select, insert, update, delete on public.comms_journeys to authenticated;
grant select, insert, update, delete on public.comms_journey_schedules to authenticated;
grant select on public.comms_journey_enrollments to authenticated;
grant select on public.comms_journey_message_log to authenticated;
grant all on public.comms_journeys, public.comms_journey_schedules, public.comms_journey_enrollments, public.comms_journey_message_log to service_role;