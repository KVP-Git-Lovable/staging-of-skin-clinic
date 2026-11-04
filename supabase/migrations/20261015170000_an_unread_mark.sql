-- Which conversations this person has already read.
--
-- Front desk had to open every thread to find out whether a patient had
-- answered. The list showed a "Waiting" chip when the last message came in,
-- but that is not the same thing: it stayed on a thread somebody had read an
-- hour ago and said nothing about what was new since.
--
-- Per user rather than per clinic. The front desk share one login today, so in
-- practice this behaves as one shared inbox - which is what they want - but a
-- doctor signing in separately does not silently clear their marks.

create table if not exists public.whatsapp_thread_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  phone text not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, phone)
);

alter table public.whatsapp_thread_reads enable row level security;

-- Own rows only, in all four directions. When somebody last looked at a
-- patient's messages is nobody else's business.
drop policy if exists "Users can read their own read marks" on public.whatsapp_thread_reads;
create policy "Users can read their own read marks"
  on public.whatsapp_thread_reads for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can mark a thread read" on public.whatsapp_thread_reads;
create policy "Users can mark a thread read"
  on public.whatsapp_thread_reads for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can update their own read marks" on public.whatsapp_thread_reads;
create policy "Users can update their own read marks"
  on public.whatsapp_thread_reads for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can clear their own read marks" on public.whatsapp_thread_reads;
create policy "Users can clear their own read marks"
  on public.whatsapp_thread_reads for delete to authenticated using (auth.uid() = user_id);
