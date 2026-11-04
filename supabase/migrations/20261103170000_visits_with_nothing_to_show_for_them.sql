-- Past visits marked Completed with nothing recorded against them.
--
-- Dia K's 25 September visit read "Billed" on her Appts tab although she
-- never attended: it arrived from Salesforce already marked "Completed", and
-- the badge was derived from that word. The badge now reads the invoice
-- instead, so it no longer lies - but the underlying record still claims a
-- visit that did not happen, and it is not alone.
--
-- This view lists the candidates so the clinic can look at them. It is a
-- QUESTION, not a verdict: a free follow-up that genuinely happened and was
-- never charged looks exactly the same from here. That is precisely why
-- nothing is corrected in bulk - only the rows a human has vouched for.
--
-- The test is deliberately narrow. A visit counts as having something to show
-- for it if it carries a live bill (Cancelled and Merged are not money anyone
-- was charged - the same rule as invoiceMapByAppointment in the app) or a
-- recorded procedure. Photos and survey responses are NOT part of the test:
-- they are common on visits that were also billed and rare on the ones in
-- question, so including them would hide rows rather than reveal them.
--
-- security_invoker: the view runs as whoever selects from it, so the row
-- level security on appointments still applies. Without it a view silently
-- hands out rows its reader could not query directly.

create or replace view public.visits_needing_review
with (security_invoker = true) as
select
  a.id            as appointment_id,
  a.patient_id,
  a.patient_name,
  a.start_time,
  a.service,
  a.doctor_name,
  a.staff_id,
  a.status,
  -- Where the row came from, which is the strongest clue available: 4,754 of
  -- these carry an sf_id, against 5 created in the app.
  (a.sf_id is not null) as from_salesforce,
  a.created_at
from public.appointments a
where a.status = 'Completed'
  and a.start_time < now()
  and not exists (
    select 1 from public.invoices i
     where i.appointment_id = a.id
       and coalesce(i.status, '') not in ('Cancelled', 'Merged')
  )
  and not exists (
    select 1 from public.procedures p
     where p.appointment_id = a.id
  );

comment on view public.visits_needing_review is
  'Past appointments marked Completed with no live invoice and no procedure. Candidates for review, not a verdict - an unbilled visit that genuinely happened looks identical. Read-only.';

grant select on public.visits_needing_review to authenticated;
