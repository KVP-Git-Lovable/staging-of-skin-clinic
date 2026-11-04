-- 15,836 visits stamped with a date nobody attended
--
-- Doctors found patients showing a Consultation on 23 April 2026 that never
-- happened and that Salesforce has no record of. It was not a rendering glitch:
-- 15,850 procedures were dated that day, against a normal clinic day of about
-- 35, and 35 appointments were booked. 15,836 of them carry no Salesforce id -
-- the only rows in the table that do not, apart from 34 genuine app-created
-- visits. Every one was inserted in a single batch, procedure_date exactly
-- 00:00:00, no doctor, and service_name "Consultation" on 15,644.
--
-- The cause is the spreadsheet importer: src/lib/procedureImport.ts applies one
-- "Default procedure date" to every row when no date column is mapped, and
-- names a row with no service "Consultation". The clinic's visit history was
-- imported on 23 April without the date column mapped, so the whole history
-- collapsed onto that day, across 7,744 patients.
--
-- These are real visits. They hold 13,717 diagnoses and 10,708 sets of notes,
-- and not one of the 15,836 is empty - every row carries service lines,
-- medicines or attachments. Only 2,088 duplicate a properly dated Salesforce
-- row. So they are kept and the date is disowned instead.
--
-- procedure_date is NOT NULL, and a flag alone would leave every screen and
-- query nobody remembered to change still listing them under 23 April. Moving
-- the date out of band is what makes "nothing shows on that day" true
-- everywhere at once. The earliest genuine visit is 2020-08-03 and nothing
-- predates 2015, so the sentinel cannot collide with real data, and the value
-- being replaced was never real anyway.
--
-- The 14 genuine 23 April visits - all with a Salesforce id and an appointment -
-- are untouched.

-- Reversible: one update against this table puts the old value back.
create table if not exists public.procedures_undated_20260925 as
select id, procedure_date as original_procedure_date, now() as taken_at
from public.procedures
where procedure_date::date = '2026-04-23' and sf_id is null;

alter table public.procedures_undated_20260925 enable row level security;
revoke all on public.procedures_undated_20260925 from anon, authenticated;

alter table public.procedures
  add column if not exists date_not_recorded boolean not null default false;

comment on column public.procedures.date_not_recorded is
  'The visit is real but its date was never captured. procedure_date holds the 1900-01-01 sentinel; screens show "Date not recorded".';

update public.procedures
set date_not_recorded = true,
    procedure_date = timestamptz '1900-01-01 00:00:00+00'
where procedure_date::date = '2026-04-23' and sf_id is null;
