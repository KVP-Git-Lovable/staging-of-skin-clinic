-- Make a wrong patient category impossible to store.
--
-- 20261104170000 banded engagement_tier on lifetime billing and backfilled
-- every patient. Within the hour a patient showing Rs 91,448 was wearing a
-- Platinum badge again. The row said why: engagement_score 82,
-- engagement_tier 'Platinum', engagement_updated_at a few minutes earlier.
-- Score >= 80 was the OLD rule.
--
-- The corrected patient-engagement function was pushed to the repository but
-- never deployed, so the previous version is still running, and it rewrites
-- engagement_tier from the score every time somebody opens a patient. 37 rows
-- had been overwritten; the ones nobody had opened were still correct.
--
-- Deploying it is not something this session can do - the Supabase tools are
-- permission-blocked here - so the fix must not depend on that happening. It
-- should not depend on it anyway: a derived column that any caller can
-- overwrite is not derived, it is a suggestion.
--
-- So the database decides. The trigger below overrides whatever a client
-- sends, using the same bands as recalc_patient_invoice_rollups. The stale
-- function may keep posting 'Platinum'; the row will read 'Silver'. It closes
-- hand-editing from every screen at the same time - the patients Kanban
-- guard added alongside this is now a courtesy message rather than the only
-- thing standing in the way.
--
-- Cheap by construction: a CASE over a column already on the row being
-- written, no query, no lookup.

create or replace function public.force_patient_tier()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Rs 3,00,000 exactly is still Gold; Platinum is strictly above.
  -- Nothing billed, or a negative from a refund, is Early rather than a band.
  new.engagement_tier := case
    when new.lifetime_value > 300000 then 'Platinum'
    when new.lifetime_value >= 100000 then 'Gold'
    when new.lifetime_value > 0 then 'Silver'
    else 'Early'
  end;
  return new;
end; $$;

comment on function public.force_patient_tier() is
  'Forces patients.engagement_tier to the band for patients.lifetime_value, overriding whatever the caller sent. The category is derived from billing and no client may set it.';

drop trigger if exists force_patient_tier on public.patients;
create trigger force_patient_tier
  before insert or update on public.patients
  for each row execute function public.force_patient_tier();

-- Re-correct the rows the stale function had already overwritten. Touching
-- lifetime_value with its own value is enough to fire the trigger.
update public.patients p
   set lifetime_value = p.lifetime_value
 where p.engagement_tier is distinct from
   (case
      when p.lifetime_value > 300000 then 'Platinum'
      when p.lifetime_value >= 100000 then 'Gold'
      when p.lifetime_value > 0 then 'Silver'
      else 'Early'
    end);
