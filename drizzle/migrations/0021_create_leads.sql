create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text not null, email text, city text, source text, interest text,
  status text not null default 'new' check (status in ('new','contacted','qualified','appointment_booked','converted','lost')),
  owner_id uuid references public.staff(id) on delete set null,
  notes text, source_ref text,
  converted_patient_id uuid references public.patients(id) on delete set null,
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_owner_idx on public.leads (owner_id);
drop trigger if exists leads_updated_at on public.leads;
create trigger leads_updated_at before update on public.leads for each row execute function public.comms_set_updated_at();
alter table public.leads enable row level security;
drop policy if exists "staff view leads" on public.leads;
create policy "staff view leads" on public.leads for select to authenticated using (public.current_staff_id() is not null);
drop policy if exists "staff create leads" on public.leads;
create policy "staff create leads" on public.leads for insert to authenticated with check (public.current_staff_id() is not null);
drop policy if exists "staff update leads" on public.leads;
create policy "staff update leads" on public.leads for update to authenticated using (public.current_staff_id() is not null);
drop policy if exists "owner or full-scope delete leads" on public.leads;
create policy "owner or full-scope delete leads" on public.leads for delete to authenticated using (created_by = public.current_staff_id() or owner_id = public.current_staff_id() or public.has_full_data_scope());
grant select, insert, update, delete on public.leads to authenticated;
grant all on public.leads to service_role;