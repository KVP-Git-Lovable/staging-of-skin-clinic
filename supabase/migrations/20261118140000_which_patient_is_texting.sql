-- Which patient is texting.
--
-- The clinic sent Pooja N Patil a reminder for her appointment tomorrow. She
-- replied "Confirm" and the bot answered "Thanks for confirming, Vihaan!".
-- Pooja and Vihaan Patil share one phone number, 9632194276 - a family does.
--
-- whatsapp-webhook picked the wrong one, and not by accident of logic: it
-- asked for any patient on that number and took the first row back.
--
--   .or(`phone.eq.${phone},phone.ilike.%${last10}`).limit(1)
--
-- A LIMIT with no ORDER BY has no defined answer. Postgres returned Vihaan,
-- whose single appointment was in April; Pooja has nine and one tomorrow.
--
-- ── How much of the clinic this touches ──
--
-- 2,587 phone numbers carry more than one patient, between them 5,879 people -
-- 21% of everyone with a phone on file. One number has fourteen profiles. For
-- every one of them the answer was arbitrary.
--
-- Today that shows up as the wrong name, because the WhatsApp bot is switched
-- off and only fixed replies go out. The identity it picks is also stamped on
-- the conversation rows, so the inbox files a reply under the wrong patient.
-- The moment the bot is switched back on the same identity decides which
-- patient's appointments and orders are listed, and whose appointment a
-- "cancel" cancels - so this is worth fixing now rather than then.
--
-- ── What decides it ──
--
-- The question is always "who did we just message?", and the strongest honest
-- answer available is the appointment: a reply today belongs to the person who
-- has an appointment around today, not the one who last came in April.
--
--   1. the nearest appointment between two days ago and thirty days out,
--      ignoring cancelled ones;
--   2. failing that, whoever came most recently;
--   3. failing that, the profile made first - so the answer is at least the
--      same every time, which an unordered LIMIT never was.
--
-- Deliberately NOT used: the patient on the last WhatsApp message from this
-- number. It reads well until you notice it is self-reinforcing - this very
-- thread already carries two rows filed under Vihaan, and that signal would
-- keep choosing him forever.
--
-- Candidates come from phone_last10, the generated column the clinic already
-- indexes, so an awkwardly stored number like '733 859 4205' still matches
-- where a LIKE on the raw text would not. Matching is on `phone` only, the
-- same set the webhook looks at today; alternate_phone is left for another
-- day rather than quietly widening who can be reached here.

create or replace function public.whatsapp_patient_for_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $fn$
  with digits as (
    -- Twilio sends "whatsapp:+919632194276"; the clinic stores "9632194276".
    select nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '') as last10
  ),
  candidates as (
    select p.id, p.created_at
      from public.patients p, digits d
     where d.last10 is not null
       and length(d.last10) = 10
       and p.phone_last10 = d.last10
  )
  select c.id
    from candidates c
    left join lateral (
      select min(abs(extract(epoch from (a.start_time - now())))) as nearest
        from public.appointments a
       where a.patient_id = c.id
         and a.start_time between now() - interval '2 days' and now() + interval '30 days'
         and coalesce(a.status, '') <> 'Cancelled'
    ) appt on true
    left join lateral (
      select max(a.start_time) as last_visit
        from public.appointments a
       where a.patient_id = c.id
    ) hist on true
   order by appt.nearest asc nulls last,
            hist.last_visit desc nulls last,
            c.created_at asc
   limit 1
$fn$;

comment on function public.whatsapp_patient_for_phone(text) is
  'Which patient a WhatsApp message from this number is from, when several share it: the one with an appointment around now, else the one who came most recently, else the oldest profile. Replaces an unordered LIMIT 1 that answered arbitrarily.';

revoke all on function public.whatsapp_patient_for_phone(text) from public, anon;
grant execute on function public.whatsapp_patient_for_phone(text) to authenticated, service_role;
