-- The doctor who sent them.
--
-- The Salesforce migration brought the referral FLAG and not the NAME: 152
-- patients read "Reference - other Dr" and not one says who referred them.
-- They are worth about Rs 12.9 lakh of billing between them, and the clinic
-- wants to thank those doctors at Diwali.
--
-- The connector is already wired up, so the name can be fetched. This is the
-- write half: a fill-only bulk update the importer calls once a human has
-- chosen which Salesforce field holds the name.
--
-- Fill-only, and narrow on purpose:
--
--   * Only a patient whose source says a DOCTOR referred them. The same
--     column holds a referring patient's UUID for a patient referral, and
--     writing a doctor's name over one of those would make the Details tab
--     print a name where it looks up an id. The test mirrors referralKind()
--     in src/lib/patientReferral.ts: mentions a referral, does not mention a
--     patient.
--   * Only where nothing is recorded yet. A name typed into this app is never
--     replaced by one from Salesforce, and a blank from Salesforce can never
--     erase one here.
--   * Every change recorded in patient_referral_doctor_corrections, before and
--     after, the way the demographics import records its own.

create table if not exists public.patient_referral_doctor_corrections (
  patient_id uuid,
  sf_id text,
  was text,
  now text,
  corrected_at timestamptz not null default now()
);

comment on table public.patient_referral_doctor_corrections is
  'Every referring doctor filled in from Salesforce, with what was there before.';

create unique index if not exists patient_referral_doctor_corrections_once
  on public.patient_referral_doctor_corrections (patient_id, sf_id);

create or replace function public.sf_set_referring_doctor_bulk(payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_updated integer := 0;
begin
  with batch as (
    select distinct on (x.sf_id) x.sf_id,
           nullif(btrim(coalesce(x.referring_doctor,'')),'') as referring_doctor
      from jsonb_to_recordset(payload) as x(sf_id text, referring_doctor text)
     where x.sf_id is not null
  ), targets as (
    select p.id, p.sf_id, p.source_referral_doctor as was, b.referring_doctor as now
      from public.patients p
      join batch b on p.sf_id = b.sf_id
     where b.referring_doctor is not null
       -- a doctor referral, not a patient one - mirrors referralKind()
       and p.source ~* 'refer'
       and p.source !~* '\mpatients?\M'
       -- and nothing recorded here yet
       and nullif(btrim(coalesce(p.source_referral_doctor,'')),'') is null
  ), logged as (
    insert into public.patient_referral_doctor_corrections (patient_id, sf_id, was, now)
    select t.id, t.sf_id, t.was, t.now from targets t
    on conflict do nothing returning 1
  ), upd as (
    update public.patients p
       set source_referral_doctor = t.now
      from targets t
     where p.id = t.id
    returning 1
  )
  select count(*) into v_updated from upd;
  return v_updated;
end; $function$;

comment on function public.sf_set_referring_doctor_bulk(jsonb) is
  'Fill-only: writes a referring doctor onto doctor-referral patients that have none.';
