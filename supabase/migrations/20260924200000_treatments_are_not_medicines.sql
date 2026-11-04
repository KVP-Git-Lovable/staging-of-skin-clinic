-- Treatments were sitting in the medicines list, on screen and on the printout
--
-- Reported from the clinic: Cheryl Fernandes' visit listed Fillers, Laser hair
-- reduction, Revlite laser toning and Skin boosters under Products/Medications,
-- and the printed prescription repeated it. Those are treatments, not medicines.
--
-- Cause: the Salesforce import reads Product__c .. Product14__c into
-- `prescriptions`, and the clinic used those fields for both recommended
-- treatments and take-home products. 8,671 rows across 62 distinct names came
-- in that way, none of which exists in the pharmacy catalogue - so this was
-- never one patient. Revlite laser toning appeared 1,290 times, Laser hair
-- reduction 630, Peels 578.
--
-- Two things follow. The rows already imported have to move to
-- `procedure_services`, which is what both the visit screen and the printed
-- prescription read for procedures; and because the Salesforce sync is still
-- running, the route itself has to change or the next pass recreates them. The
-- importer is an edge function and cannot be redeployed from here, so the guard
-- lives in the database.
--
-- This migration records work already applied to production on 2026-09-24. It
-- is written to be re-runnable: the table creations are guarded, and the move
-- matches nothing once it has run.

-- 1. The names that are treatments ------------------------------------------
--
-- Kept as a table rather than hard-coded in the trigger so the clinic can add
-- to it without a migration. Names are stored normalised: trimmed, lowercased,
-- runs of whitespace collapsed - the same shape the trigger computes.

create table if not exists public.treatment_names (
  name     text primary key,
  source   text not null,
  added_at timestamptz not null default now()
);

alter table public.treatment_names enable row level security;

drop policy if exists treatment_names_read on public.treatment_names;
create policy treatment_names_read
  on public.treatment_names for select to authenticated using (true);

-- Three sources, in descending order of how much judgement each involved.
--
-- `service master` - the clinic's own Services table. No judgement at all.
-- `billed as a service in salesforce` - these names carry service line items in
--   the imported billing, so the clinic itself treated them as services.
-- `named as a treatment, confirmed by the clinic` - the only judgement here.
--   Every one of these rows is recoverable from the backup table below, so a
--   name in the wrong group is a one-statement correction.

insert into public.treatment_names (name, source) values
    ('acnelan','service master'),
    ('botox','service master'),
    ('collagen booster','service master'),
    ('consultation - dr ashwini ashokan','service master'),
    ('consultation - dr p suraksha','service master'),
    ('consultation - dr punya suvarna','service master'),
    ('consultation- dr vindhya pai','service master'),
    ('cosmetic consult','service master'),
    ('dermal fillers','service master'),
    ('dpn','service master'),
    ('emface','service master'),
    ('emsculpt neo','service master'),
    ('excimer','service master'),
    ('exion','service master'),
    ('exion body','service master'),
    ('exion mnrf','service master'),
    ('face hair reduction','service master'),
    ('fillers','service master'),
    ('fractional co2 laser-2','service master'),
    ('full arms hair reduction','service master'),
    ('full legs hair reduction','service master'),
    ('gfc','service master'),
    ('hair reduction treatment','service master'),
    ('hydra clean up','service master'),
    ('hydra perk','service master'),
    ('hydradeluxe','service master'),
    ('hydraplatinum','service master'),
    ('hydrasignature','service master'),
    ('ipl photofacial - b','service master'),
    ('ipl photofacial -a','service master'),
    ('nano peel','service master'),
    ('onda','service master'),
    ('peel a','service master'),
    ('peel b','service master'),
    ('peel treatment','service master'),
    ('photofractional treatment','service master'),
    ('pore refining','service master'),
    ('prp treatement','service master'),
    ('qr678 neo','service master'),
    ('radiance a','service master'),
    ('radiance c','service master'),
    ('revlite laser toning a','service master'),
    ('revlite laser toning b','service master'),
    ('scalp booster','service master'),
    ('scalp health treatment','service master'),
    ('scar refining','service master'),
    ('scar revision a','service master'),
    ('scar revision b','service master'),
    ('scar revision c+ subcision','service master'),
    ('skin booster','service master'),
    ('smooth glow treatment','service master'),
    ('smooth rejuvenation','service master'),
    ('smooth toning','service master'),
    ('spot resurfx','service master'),
    ('tattoo removal','service master'),
    ('trifractional treatment','service master'),
    ('viora','service master'),
    ('acne scar refining','billed as a service in salesforce'),
    ('acne scar revision','billed as a service in salesforce'),
    ('exion face','billed as a service in salesforce'),
    ('hydracleanup','billed as a service in salesforce'),
    ('hydraperk','billed as a service in salesforce'),
    ('ipl photofacial','billed as a service in salesforce'),
    ('peels','billed as a service in salesforce'),
    ('radiance b','billed as a service in salesforce'),
    ('resurfx','billed as a service in salesforce'),
    ('revlite laser toning','billed as a service in salesforce'),
    ('acnelan peel','named as a treatment, confirmed by the clinic'),
    ('collagen booster/anti-ageing','named as a treatment, confirmed by the clinic'),
    ('hydrapeel','named as a treatment, confirmed by the clinic'),
    ('iv glutathione','named as a treatment, confirmed by the clinic'),
    ('laser hair reduction','named as a treatment, confirmed by the clinic'),
    ('prp/gfc (platelet rich plasma)','named as a treatment, confirmed by the clinic'),
    ('qr678neo','named as a treatment, confirmed by the clinic'),
    ('radiance plus','named as a treatment, confirmed by the clinic'),
    ('scalpbooster treatment','named as a treatment, confirmed by the clinic'),
    ('skin boosters','named as a treatment, confirmed by the clinic'),
    ('smooth glo treatment','named as a treatment, confirmed by the clinic'),
    ('tcs acne treatment','named as a treatment, confirmed by the clinic'),
    ('tripolar treatment','named as a treatment, confirmed by the clinic'),
    ('under eye rejuvenation','named as a treatment, confirmed by the clinic'),
    ('voluderm treatment','named as a treatment, confirmed by the clinic')
on conflict (name) do nothing;

-- Names that stay medicines, for the record, because each carries a dose form
-- or is a named cosmetic product: Atoderm soap, Sebium Gel Moussant,
-- Tab.SOTRET 10MG, Q-Sera hair serum, Triobloc, Oryza Lotion, Vinskin gentle
-- cleanser, Vinskin SPF 50, Vinskin ACNE OIL CONTROL GEL, Vinskin EMOLLIENT
-- LOTION, Proanagen stem advance solution, Dolo 650, Sunscreen SPF 50,
-- Cap.Isotroin 20mg, Clindamycin Lotion 1%, T. Metronidazole 400mg.

-- 2. Keep every row before moving it ----------------------------------------
--
-- Complete copies, so putting one back is an insert. Patient prescription data,
-- so RLS on with no policy: nothing reaches it through the API, and the
-- service role still can.

create table if not exists public.prescriptions_moved_to_services_20260924
  as select * from public.prescriptions where false;

alter table public.prescriptions_moved_to_services_20260924 enable row level security;
revoke all on public.prescriptions_moved_to_services_20260924 from anon, authenticated;

insert into public.prescriptions_moved_to_services_20260924
select p.* from public.prescriptions p
where p.product_id is null
  and exists (
    select 1 from public.treatment_names t
    where t.name = lower(regexp_replace(btrim(p.medicine_name), '\s+', ' ', 'g'))
  )
  and not exists (
    select 1 from public.prescriptions_moved_to_services_20260924 b where b.id = p.id
  );

-- 3. Move them ---------------------------------------------------------------
--
-- `instructions` on these rows is the treatment's description, not a dose, so
-- it carries across as `procedure_notes`. Losing it would lose the only text
-- the visit holds about the treatment.
--
-- Linked to services.id where the name matches one, left null where it does
-- not; the printed name is kept either way.

insert into public.procedure_services
  (procedure_id, service_id, service_name, procedure_notes, sort_order)
select p.procedure_id,
       (select s.id from public.services s
         where lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g'))
             = lower(regexp_replace(btrim(p.medicine_name), '\s+', ' ', 'g'))
         limit 1),
       btrim(p.medicine_name),
       nullif(btrim(coalesce(p.instructions, '')), ''),
       coalesce((select max(ps.sort_order) from public.procedure_services ps
                  where ps.procedure_id = p.procedure_id), -1) + 1
from public.prescriptions p
where p.product_id is null
  and exists (
    select 1 from public.treatment_names t
    where t.name = lower(regexp_replace(btrim(p.medicine_name), '\s+', ' ', 'g'))
  )
  and not exists (
    select 1 from public.procedure_services ps
    where ps.procedure_id = p.procedure_id
      and lower(regexp_replace(btrim(ps.service_name), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(p.medicine_name), '\s+', ' ', 'g'))
  );

delete from public.prescriptions p
where p.product_id is null
  and exists (
    select 1 from public.treatment_names t
    where t.name = lower(regexp_replace(btrim(p.medicine_name), '\s+', ' ', 'g'))
  );

-- 4. Stop the sync putting them back ----------------------------------------
--
-- BEFORE INSERT, so a treatment name never lands in `prescriptions` at all: the
-- row is written to `procedure_services` instead and the insert returns null.
-- A row with a product_id is a real catalogue product and is left alone
-- whatever it is called.
--
-- This fires before stamp_audit_user (r sorts before s), which is right: a
-- diverted row is not a prescription and should not be stamped as one.

create or replace function public.route_treatments_to_services()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare key text := lower(regexp_replace(btrim(new.medicine_name), '\s+', ' ', 'g'));
begin
  if new.product_id is not null then return new; end if;
  if key = '' or not exists (select 1 from treatment_names t where t.name = key) then return new; end if;
  insert into procedure_services (procedure_id, service_id, service_name, procedure_notes, sort_order)
  select new.procedure_id,
         (select s.id from services s where lower(regexp_replace(btrim(s.name), '\s+', ' ', 'g')) = key limit 1),
         btrim(new.medicine_name),
         nullif(btrim(coalesce(new.instructions, '')), ''),
         coalesce((select max(ps.sort_order) from procedure_services ps where ps.procedure_id = new.procedure_id), -1) + 1
  where not exists (
    select 1 from procedure_services ps
    where ps.procedure_id = new.procedure_id
      and lower(regexp_replace(btrim(ps.service_name), '\s+', ' ', 'g')) = key);
  return null;
end; $function$;

drop trigger if exists route_treatments_to_services on public.prescriptions;
create trigger route_treatments_to_services
  before insert on public.prescriptions
  for each row execute function public.route_treatments_to_services();
