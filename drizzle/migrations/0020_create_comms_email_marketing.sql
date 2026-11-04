create table if not exists public.comms_email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null default '',
  preview_text text,
  from_name text,
  from_email text,
  reply_to text,
  html text,
  audience_config jsonb,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','paused','failed','cancelled')),
  scheduled_at timestamptz,
  timezone text,
  mailchimp_list_id text,
  mailchimp_segment_id bigint,
  mailchimp_campaign_id text,
  mailchimp_web_id bigint,
  mailchimp_account_id text,
  mailchimp_report_synced_at timestamptz,
  last_error text,
  audience_snapshot_count int,
  sent_count int not null default 0,
  delivered_count int not null default 0,
  open_count int not null default 0,
  click_count int not null default 0,
  bounce_count int not null default 0,
  spam_count int not null default 0,
  unsubscribe_count int not null default 0,
  processed_count int not null default 0,
  dropped_count int not null default 0,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists comms_email_campaigns_status_idx on public.comms_email_campaigns (status);
create index if not exists comms_email_campaigns_mc_idx on public.comms_email_campaigns (mailchimp_campaign_id);

create table if not exists public.comms_email_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.comms_email_campaigns(id) on delete cascade,
  email text not null,
  patient_id uuid references public.patients(id) on delete set null,
  merge_vars jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (campaign_id, email)
);

create table if not exists public.comms_email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.comms_email_campaigns(id) on delete cascade,
  recipient_email text not null,
  event_type text not null,
  url text,
  reason text,
  event_key text not null unique,
  event_timestamp timestamptz not null default now(),
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists comms_email_events_campaign_idx on public.comms_email_events (campaign_id, event_timestamp);

create table if not exists public.comms_email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'custom' check (category in ('welcome','promotions','offers','newsletters','followup','custom')),
  subject text,
  preview_text text,
  html text not null default '',
  thumbnail_url text,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comms_email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  campaign_id uuid references public.comms_email_campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.comms_email_test_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.comms_email_campaigns(id) on delete cascade,
  recipients text[] not null default '{}',
  sent_by uuid references public.staff(id) on delete set null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent',
  error_message text
);

create table if not exists public.comms_mailchimp_connection (
  id uuid primary key default gen_random_uuid(),
  account_id text,
  account_name text,
  login_email text,
  dc text,
  pricing_plan_type text,
  total_subscribers int,
  default_list_id text,
  default_list_name text,
  webhook_id text,
  webhook_secret text,
  consent_confirmed_at timestamptz,
  consent_confirmed_by uuid references public.staff(id) on delete set null,
  last_ping_at timestamptz,
  last_error text,
  status text not null default 'connected' check (status in ('connected','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists comms_email_campaigns_updated_at on public.comms_email_campaigns;
create trigger comms_email_campaigns_updated_at before update on public.comms_email_campaigns for each row execute function public.comms_set_updated_at();
drop trigger if exists comms_email_templates_updated_at on public.comms_email_templates;
create trigger comms_email_templates_updated_at before update on public.comms_email_templates for each row execute function public.comms_set_updated_at();
drop trigger if exists comms_mailchimp_connection_updated_at on public.comms_mailchimp_connection;
create trigger comms_mailchimp_connection_updated_at before update on public.comms_mailchimp_connection for each row execute function public.comms_set_updated_at();

create or replace function public.comms_email_campaigns_guard() returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') = 'authenticated' then
    if tg_op = 'INSERT' then
      new.status := 'draft'; new.mailchimp_list_id := null; new.mailchimp_segment_id := null; new.mailchimp_campaign_id := null;
      new.mailchimp_web_id := null; new.mailchimp_account_id := null; new.mailchimp_report_synced_at := null; new.last_error := null;
      new.audience_snapshot_count := null; new.sent_count := 0; new.delivered_count := 0; new.open_count := 0; new.click_count := 0;
      new.bounce_count := 0; new.spam_count := 0; new.unsubscribe_count := 0; new.processed_count := 0; new.dropped_count := 0;
    else
      if new.status is distinct from old.status
         or new.mailchimp_list_id is distinct from old.mailchimp_list_id
         or new.mailchimp_segment_id is distinct from old.mailchimp_segment_id
         or new.mailchimp_campaign_id is distinct from old.mailchimp_campaign_id
         or new.mailchimp_web_id is distinct from old.mailchimp_web_id
         or new.mailchimp_account_id is distinct from old.mailchimp_account_id
         or new.mailchimp_report_synced_at is distinct from old.mailchimp_report_synced_at
         or new.last_error is distinct from old.last_error
         or new.audience_snapshot_count is distinct from old.audience_snapshot_count
         or new.sent_count is distinct from old.sent_count
         or new.delivered_count is distinct from old.delivered_count
         or new.open_count is distinct from old.open_count
         or new.click_count is distinct from old.click_count
         or new.bounce_count is distinct from old.bounce_count
         or new.spam_count is distinct from old.spam_count
         or new.unsubscribe_count is distinct from old.unsubscribe_count
         or new.processed_count is distinct from old.processed_count
         or new.dropped_count is distinct from old.dropped_count then
        raise exception 'Campaign status, Mailchimp details and statistics can only be changed by the sending workflow';
      end if;
      if old.status not in ('draft','failed') and (
           new.name is distinct from old.name or new.subject is distinct from old.subject or new.preview_text is distinct from old.preview_text
           or new.from_name is distinct from old.from_name or new.from_email is distinct from old.from_email or new.reply_to is distinct from old.reply_to
           or new.html is distinct from old.html or new.audience_config is distinct from old.audience_config
           or new.scheduled_at is distinct from old.scheduled_at) then
        raise exception 'This campaign has already been launched and can no longer be edited';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comms_email_campaigns_guard on public.comms_email_campaigns;
create trigger comms_email_campaigns_guard before insert or update on public.comms_email_campaigns for each row execute function public.comms_email_campaigns_guard();

alter table public.comms_email_campaigns enable row level security;
alter table public.comms_email_recipients enable row level security;
alter table public.comms_email_events enable row level security;
alter table public.comms_email_templates enable row level security;
alter table public.comms_email_suppressions enable row level security;
alter table public.comms_email_test_sends enable row level security;
alter table public.comms_mailchimp_connection enable row level security;

drop policy if exists "staff view email campaigns" on public.comms_email_campaigns;
create policy "staff view email campaigns" on public.comms_email_campaigns for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff create email campaigns" on public.comms_email_campaigns;
create policy "staff create email campaigns" on public.comms_email_campaigns for insert to authenticated with check (created_by = public.current_staff_id());
drop policy if exists "owner or full-scope update email campaigns" on public.comms_email_campaigns;
create policy "owner or full-scope update email campaigns" on public.comms_email_campaigns for update to authenticated using (created_by = public.current_staff_id() or public.has_full_data_scope());
drop policy if exists "staff view email recipients" on public.comms_email_recipients;
create policy "staff view email recipients" on public.comms_email_recipients for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff view email events" on public.comms_email_events;
create policy "staff view email events" on public.comms_email_events for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff view email templates" on public.comms_email_templates;
create policy "staff view email templates" on public.comms_email_templates for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff create email templates" on public.comms_email_templates;
create policy "staff create email templates" on public.comms_email_templates for insert to authenticated with check (created_by = public.current_staff_id());
drop policy if exists "owner or full-scope update email templates" on public.comms_email_templates;
create policy "owner or full-scope update email templates" on public.comms_email_templates for update to authenticated using (created_by = public.current_staff_id() or public.has_full_data_scope());
drop policy if exists "owner or full-scope delete email templates" on public.comms_email_templates;
create policy "owner or full-scope delete email templates" on public.comms_email_templates for delete to authenticated using (created_by = public.current_staff_id() or public.has_full_data_scope());
drop policy if exists "staff view email suppressions" on public.comms_email_suppressions;
create policy "staff view email suppressions" on public.comms_email_suppressions for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff view email test sends" on public.comms_email_test_sends;
create policy "staff view email test sends" on public.comms_email_test_sends for select to authenticated using (public.current_staff_id() is not null);
-- comms_mailchimp_connection intentionally has no policies: service role only.

grant select, insert, update on public.comms_email_campaigns to authenticated;
grant select on public.comms_email_recipients, public.comms_email_events, public.comms_email_suppressions, public.comms_email_test_sends to authenticated;
grant select, insert, update, delete on public.comms_email_templates to authenticated;
grant all on public.comms_email_campaigns, public.comms_email_recipients, public.comms_email_events, public.comms_email_templates, public.comms_email_suppressions, public.comms_email_test_sends, public.comms_mailchimp_connection to service_role;