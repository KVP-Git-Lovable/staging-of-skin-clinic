-- Some patients must be recognised the moment they walk in, and the front desk
-- does not always know who they are.
--
-- This is NOT the engagement tier beside it. That one is computed - visits,
-- revenue, treatment depth - and it answers "how much has this patient spent
-- with us". VIP is a judgement somebody makes on purpose, and the two do not
-- follow each other: a doctor's mother can be VIP on her first visit and will
-- never be Platinum.
--
-- A plain flag, defaulting to false, so every one of the 27,000 existing
-- patients reads exactly as it did before.

alter table public.patients
  add column if not exists is_vip boolean not null default false;

comment on column public.patients.is_vip is
  'Marked by staff so the front desk recognises this patient on arrival. Deliberate, unlike the computed engagement_tier.';
