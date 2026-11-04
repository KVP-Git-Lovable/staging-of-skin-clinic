-- 1. Create public invoices bucket
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', true)
on conflict (id) do update set public = true;

-- 2. Storage policies
drop policy if exists "Public can read invoice pdfs" on storage.objects;
create policy "Public can read invoice pdfs"
on storage.objects for select
to public
using (bucket_id = 'invoices');

drop policy if exists "Authenticated can upload invoice pdfs" on storage.objects;
create policy "Authenticated can upload invoice pdfs"
on storage.objects for insert
to authenticated
with check (bucket_id = 'invoices');

drop policy if exists "Authenticated can update invoice pdfs" on storage.objects;
create policy "Authenticated can update invoice pdfs"
on storage.objects for update
to authenticated
using (bucket_id = 'invoices')
with check (bucket_id = 'invoices');

-- 3. Cache PDF URL on the invoice
alter table public.invoices
  add column if not exists pdf_url text;