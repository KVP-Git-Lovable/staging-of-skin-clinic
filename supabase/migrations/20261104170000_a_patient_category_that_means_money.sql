-- Band the patient category on lifetime billing, for every patient.
--
-- engagement_tier was a restatement of the engagement score: >= 80 Platinum,
-- >= 60 Gold, >= 40 Silver, else Early. That score is only a quarter revenue -
-- the rest is visit frequency, treatment depth, retention and show rate - so
-- the badge did not mean what the clinic read it to mean. It showed: Silver
-- ran from Rs 0 to Rs 3.84 lakh and Platinum began at Rs 17,700.
--
-- The clinic asked for: below Rs 1 lakh Silver, Rs 1-3 lakh Gold, above
-- Rs 3 lakh Platinum. Early is kept for a patient billed nothing at all,
-- rather than badging 7,831 never-billed records the same as one who has
-- spent Rs 99,750.
--
-- WHY HERE AND NOT ONLY IN THE EDGE FUNCTION. patient-engagement writes
-- engagement_tier, but only for the patient ids a screen asked about - there
-- is no cron and no trigger - so 21,221 patients had no tier stored at all.
-- The patients list filter, the saved views and the campaign audiences all
-- read the STORED column, so targeting "Gold patients" was quietly wrong.
-- recalc_patient_invoice_rollups already runs on every invoice insert, update
-- and delete via invoices_rollup_trigger, so the tier belongs in it.
--
-- The same bands live in src/lib/patientTier.ts and in
-- supabase/functions/patient-engagement/index.ts. patientTier.test.ts reads
-- this file and fails if the numbers here drift from those.

create or replace function public.recalc_patient_invoice_rollups(_patient_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  net numeric;
begin
  if _patient_id is null then return; end if;

  -- NET of cancelled and merged, which is the rule the rest of the app uses
  -- to decide whether a visit was billed. Previously this summed every
  -- invoice regardless of status, so a cancelled bill still counted towards
  -- a patient's lifetime value - and would have bought them a tier.
  select coalesce(sum(coalesce(i.total_amount, 0)), 0)
    into net
    from public.invoices i
   where i.patient_id = _patient_id
     and coalesce(i.status, '') not in ('Cancelled', 'Merged');

  update public.patients p
     set lifetime_value = net,
         -- Three lakh exactly is still Gold; Platinum is strictly above.
         -- A zero or negative total is "Early", never a band.
         engagement_tier = case
           when net > 300000 then 'Platinum'
           when net >= 100000 then 'Gold'
           when net > 0 then 'Silver'
           else 'Early'
         end
   where p.id = _patient_id;
end; $$;

comment on function public.recalc_patient_invoice_rollups(uuid) is
  'Maintains patients.lifetime_value (net of Cancelled/Merged invoices) and patients.engagement_tier (banded on that figure: >3L Platinum, >=1L Gold, >0 Silver, else Early). Fired by invoices_rollup_trigger. The authority for the tier - the patient-engagement edge function mirrors these bands.';

-- One-off backfill, through the same function so there is no second copy of
-- the rule. Every patient, not only the ones somebody has opened.
do $$
declare
  r record;
begin
  for r in select id from public.patients loop
    perform public.recalc_patient_invoice_rollups(r.id);
  end loop;
end $$;
