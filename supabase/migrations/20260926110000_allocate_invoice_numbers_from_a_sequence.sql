-- Where the next bill number comes from.
--
-- It used to be Date.now() in the browser: not a series, and two people billing
-- in the same millisecond were handed the same number, which nothing rejected.
-- A sequence gives unique increasing numbers however many people are billing at
-- once, and it lives in the database, where the numbers are actually used.
--
-- No ALTER TABLE on invoices: that needs ACCESS EXCLUSIVE and has timed out
-- against the Salesforce sync before. A sequence and a function need no lock on
-- the table at all.

create sequence if not exists public.invoice_number_seq as bigint;

-- Park it at the highest number either series has reached, so the next bill is
-- INV-49104. Must run AFTER the renumber: before it, the INV maximum is the
-- millisecond-derived 937073.
select setval('public.invoice_number_seq', greatest(
  (select coalesce(max((substring(invoice_number from 3))::bigint), 0)
     from public.invoices where invoice_number ~ '^B-[0-9]+$'),
  (select coalesce(max((substring(invoice_number from 5))::bigint), 0)
     from public.invoices where invoice_number ~ '^INV-[0-9]+$')));

-- Takes a count so a staged or recurring plan gets all its numbers in one
-- round trip; each of its invoices is a document in its own right and takes its
-- own number, so no number is ever shared and no suffix is needed.
create or replace function public.next_invoice_numbers(_count int default 1)
returns setof text
language sql
security definer
set search_path to 'public'
as $$
  select 'INV-' || nextval('public.invoice_number_seq')::text
    from generate_series(1, greatest(coalesce(_count, 1), 1))
$$;

grant usage, select on sequence public.invoice_number_seq to authenticated;
grant execute on function public.next_invoice_numbers(int) to authenticated;

-- There was no unique index on the number, so the old generator's collisions
-- would have been accepted in silence. Verified duplicate-free first.
create unique index if not exists invoices_invoice_number_uniq
  on public.invoices (invoice_number);
