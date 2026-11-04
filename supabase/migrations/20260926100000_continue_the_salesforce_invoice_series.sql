-- The clinic's bill series has to be unbroken for an audit.
--
-- Salesforce ended at B-49053. The 50 bills raised in this app since the
-- migration were numbered from Date.now().toString().slice(-6) in the browser -
-- the millisecond clock mod a million - giving INV-527602, INV-198844 and so on:
-- no series at all, wrapping every 16 minutes 40 seconds, so the same number
-- came round several times a day.
--
-- This renumbers those 50 to INV-49054 .. INV-49103 in the order they were
-- raised, so the app's series continues straight on from Salesforce.
--
-- Scope: invoice_number only. No amount, date, status or line item is touched.
-- Salesforce rows (sf_id IS NOT NULL) are left alone - they are deleted and
-- recreated from Billing__c.Name by sf-import-clinical, so renumbering them
-- would be silently undone on the next sync anyway.
--
-- Every statement is re-runnable: a cancelled request can still have committed.

-- The mapping is kept, not thrown away. It is the backup, and it is what lets
-- anyone tie a bill a patient is holding to its number in the system.
create table if not exists public.invoice_number_series_20260926 (
  id                 uuid primary key,
  old_invoice_number text not null,
  new_invoice_number text not null,
  created_at         timestamptz not null,
  mapped_at          timestamptz not null default now()
);

do $$
declare
  sf_max bigint;
begin
  select max((substring(invoice_number from 3))::bigint) into sf_max
    from public.invoices
   where invoice_number ~ '^B-[0-9]+$';

  -- Refuse to run if the Salesforce series is not where we think it ends,
  -- rather than numbering on from the wrong place.
  if sf_max is distinct from 49053 then
    raise exception 'Refusing to renumber: Salesforce series max is %, expected 49053', sf_max;
  end if;

  insert into public.invoice_number_series_20260926
    (id, old_invoice_number, new_invoice_number, created_at)
  select i.id,
         i.invoice_number,
         'INV-' || (sf_max + row_number() over (order by i.created_at, i.id))::text,
         i.created_at
    from public.invoices i
   where i.sf_id is null
     and i.invoice_number ~ '^INV-'
  on conflict (id) do nothing;
end $$;

-- Guarded on the old value, so a second run changes nothing.
update public.invoices i
   set invoice_number = m.new_invoice_number
  from public.invoice_number_series_20260926 m
 where i.id = m.id
   and i.invoice_number = m.old_invoice_number;

-- material_cost_lines is a VIEW that reads i.invoice_number through a join, so
-- the Material Cost report follows on its own. Nothing to update there.
