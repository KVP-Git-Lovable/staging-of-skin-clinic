-- The three appointments showing twice on the list, each from a different fault.
--
-- Volita is handled by the migration alongside this one: her duplicate was a
-- Salesforce row the clinic had already deleted and the sync kept restoring, so
-- it goes with the other 17 resurrected rows.
--
-- The two below are not that, and each needs different handling.

-- 1. Sanaa - the SAME Salesforce record imported twice ------------------------
--
-- Two rows, one sf_id (a08OW000014HN0zYAG), identical in every field including
-- created_at, which comes from Salesforce's CreatedDate and so cannot be used to
-- tell them apart. Two sync workers read "not present" at the same moment and
-- both inserted; there was no unique index to stop them.
--
-- A plain DELETE, deliberately NOT through trash. A tombstone on this sf_id
-- would look harmless today (a live row remains) but would poison the record:
-- a reset=true re-import would hard-delete then fail to re-insert it, and a
-- later trash-and-restore would silently do nothing.

delete from public.appointments
where id = '14390df0-3b68-4487-b846-366ac9aeda01'
  and sf_id = 'a08OW000014HN0zYAG'
  and not exists (select 1 from public.invoices   i where i.appointment_id = '14390df0-3b68-4487-b846-366ac9aeda01')
  and not exists (select 1 from public.procedures p where p.appointment_id = '14390df0-3b68-4487-b846-366ac9aeda01');

-- 2. Nanni - two genuinely separate Salesforce records ------------------------
--
-- Not an import fault: Salesforce holds two Appointment__c records for 15 Oct
-- 10:30, created two minutes apart and, notably, with DIFFERENT DOCTORS -
-- a08OW00001420dxYAA with Dr Vindhya Pai at 13:09, then a08OW000014279DYAQ with
-- Dr. Punya Suvarna at 13:11.
--
-- Read as a doctor being corrected shortly after booking, which makes the
-- earlier record the stale one. That is an inference, not a fact, so this goes
-- through trash rather than a plain delete: it is one click to restore, and the
-- tombstone means the sync will not undo the decision either way.

with row_snapshot as (
  select to_jsonb(a) as j, a.id
  from public.appointments a
  where a.id = '5b02cf4e-cb38-4b98-81dc-9903fe74704b'
    and a.sf_id = 'a08OW00001420dxYAA'
),
trashed as (
  insert into public.trash_items (object_type, record_id, record_label, record_data, deleted_by_name)
  select 'appointments', id, 'Nanni — Oct 15, 10:30 AM (duplicate slot, Dr Vindhya Pai)', j,
         'duplicate-cleanup-20260925'
  from row_snapshot
  returning record_id
),
stone as (
  insert into public.sf_deleted_records (object_type, sf_id, record_label)
  select 'appointments', 'a08OW00001420dxYAA', 'Nanni — Oct 15, 10:30 AM (duplicate slot)'
  where exists (select 1 from trashed)
  on conflict (object_type, sf_id) do nothing
  returning sf_id
)
delete from public.appointments
where id in (select record_id from trashed)
  and not exists (select 1 from public.invoices   i where i.appointment_id = '5b02cf4e-cb38-4b98-81dc-9903fe74704b')
  and not exists (select 1 from public.procedures p where p.appointment_id = '5b02cf4e-cb38-4b98-81dc-9903fe74704b');
