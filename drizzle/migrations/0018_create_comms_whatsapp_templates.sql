create table if not exists public.comms_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('UTILITY','MARKETING','AUTHENTICATION')),
  language text not null default 'en',
  body text not null,
  content_type text not null default 'text' check (content_type in ('text','media','call_to_action','other')),
  media_url text,
  cta_actions jsonb,
  variable_map jsonb default '{}'::jsonb,
  variable_samples jsonb default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  rejection_reason text,
  twilio_content_sid text unique,
  twilio_synced_at timestamptz,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_whatsapp_templates TO authenticated;
GRANT ALL ON public.comms_whatsapp_templates TO service_role;

create or replace function public.comms_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists comms_whatsapp_templates_updated_at on public.comms_whatsapp_templates;
create trigger comms_whatsapp_templates_updated_at before update on public.comms_whatsapp_templates for each row execute function public.comms_set_updated_at();
alter table public.comms_whatsapp_templates enable row level security;
drop policy if exists "staff view templates" on public.comms_whatsapp_templates;
create policy "staff view templates" on public.comms_whatsapp_templates for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff create templates" on public.comms_whatsapp_templates;
create policy "staff create templates" on public.comms_whatsapp_templates for insert to authenticated with check (created_by = public.current_staff_id());
drop policy if exists "owner or full-scope update" on public.comms_whatsapp_templates;
create policy "owner or full-scope update" on public.comms_whatsapp_templates for update to authenticated using (public.has_full_data_scope() or created_by = public.current_staff_id());
drop policy if exists "owner or full-scope delete" on public.comms_whatsapp_templates;
create policy "owner or full-scope delete" on public.comms_whatsapp_templates for delete to authenticated using (public.has_full_data_scope() or created_by = public.current_staff_id());

drop policy if exists "whatsapp-media public read" on storage.objects;
create policy "whatsapp-media public read" on storage.objects for select using (bucket_id = 'whatsapp-media');
drop policy if exists "whatsapp-media staff upload" on storage.objects;
create policy "whatsapp-media staff upload" on storage.objects for insert to authenticated with check (bucket_id = 'whatsapp-media' and public.current_staff_id() is not null and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "whatsapp-media staff update" on storage.objects;
create policy "whatsapp-media staff update" on storage.objects for update to authenticated using (bucket_id = 'whatsapp-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "whatsapp-media staff delete" on storage.objects;
create policy "whatsapp-media staff delete" on storage.objects for delete to authenticated using (bucket_id = 'whatsapp-media' and (storage.foldername(name))[1] = auth.uid()::text);