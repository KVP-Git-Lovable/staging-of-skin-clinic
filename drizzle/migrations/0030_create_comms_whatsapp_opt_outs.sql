create table public.comms_whatsapp_opt_outs (
  phone_last10 text primary key check (phone_last10 ~ '^[0-9]{10}$'),
  patient_id uuid references public.patients(id) on delete set null,
  reason text,
  source text not null default 'manual' check (source in ('manual','inbound_stop','import')),
  created_by uuid references public.staff(id) on delete set null default public.current_staff_id(),
  created_at timestamptz not null default now()
);
create index comms_whatsapp_opt_outs_patient_idx on public.comms_whatsapp_opt_outs (patient_id);
alter table public.comms_whatsapp_opt_outs enable row level security;
create policy "staff view opt-outs" on public.comms_whatsapp_opt_outs for select to authenticated using (public.current_staff_id() is not null);
create policy "staff add opt-outs" on public.comms_whatsapp_opt_outs for insert to authenticated with check (public.current_staff_id() is not null);
create policy "staff remove opt-outs" on public.comms_whatsapp_opt_outs for delete to authenticated using (public.current_staff_id() is not null);
grant select, insert, delete on public.comms_whatsapp_opt_outs to authenticated;
grant all on public.comms_whatsapp_opt_outs to service_role;