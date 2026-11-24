-- The visits before this one, for somebody who may only see their own.
--
-- 20261113210000 scoped `appointments` to the staff member put on them, which
-- is what the clinic asked for: a therapist's Appointments list shows her
-- work, not the whole clinic's. That rule is correct and stays.
--
-- It had a consequence nobody asked for. Inside a visit she IS on, the
-- Previous Appointments tab reads "No other appointments for this patient."
-- for every patient, because the patient's other visits were worked by
-- somebody else. A therapist treating a patient for the sixth time could not
-- see the first five, nor the notes written on them - and that is exactly what
-- she needs before touching the skin.
--
-- The carve-out here is deliberately narrow, and says one thing:
--
--     you can already open this visit, so you may read this patient's others.
--
-- It is anchored on an appointment the caller passes in, and the anchor is
-- re-checked against the SAME predicate the policy uses. Hand it a visit you
-- are not on and it returns nothing - there is no way to walk from an
-- appointment you may see to a patient you may not.
--
-- The Appointments list page is untouched: it still reads the table directly,
-- still under the policy, and still shows only the visits they were put on.
--
-- ── Billing ──
--
-- `appointments` carries no money columns at all - amounts live in `invoices`,
-- which is never joined here. There is nothing to leak. The clinic's rule that
-- a therapist sees no billing figures is enforced in the application by
-- lib/billingVisibility.ts, and this function gives it nothing to hide.
--
-- Backward-compatible: two new functions, no table, column or policy touched,
-- so the published build at clinic.quickapp.ai carries on exactly as it is.

-- ── 1. The patient's other visits ──

create or replace function public.patient_visit_history(p_appointment_id uuid)
returns table (
  id uuid,
  start_time timestamptz,
  end_time timestamptz,
  status text,
  visit_status text,
  service text,
  appointment_type text,
  consultation_type text,
  consultation_reasons text[],
  reason_for_consultation text,
  source text,
  doctor_name text,
  therapist_name text,
  staff_first_name text,
  staff_last_name text,
  -- Whether the full detail sheet would actually load for this caller. The
  -- sheet uses maybeSingle(), which returns null rather than an error for a
  -- row the policy hides, so without this the screen would offer a link to a
  -- blank page.
  can_open boolean
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select a.id, a.start_time, a.end_time, a.status, a.visit_status, a.service,
         a.appointment_type, a.consultation_type, a.consultation_reasons,
         a.reason_for_consultation, a.source, a.doctor_name, a.therapist_name,
         s.first_name, s.last_name,
         (public.sees_all_appointments()
           or a.staff_id = public.current_staff_id()
           or a.therapist_id = public.current_staff_id()
           or public.current_staff_id() = any(a.therapist_ids)) as can_open
    from public.appointments anchor
    join public.appointments a
      on a.patient_id = anchor.patient_id
     and a.id <> anchor.id
    left join public.staff s on s.id = a.staff_id
   where anchor.id = p_appointment_id
     -- Staff only, the same bar every table carries.
     and public.is_active_staff()
     -- The policy's own predicate, applied to the anchor. This is the whole
     -- guard: no anchor you may see, no rows.
     and (public.sees_all_appointments()
           or anchor.staff_id = public.current_staff_id()
           or anchor.therapist_id = public.current_staff_id()
           or public.current_staff_id() = any(anchor.therapist_ids))
   order by a.start_time desc
$fn$;

comment on function public.patient_visit_history(uuid) is
  'The other visits of the patient whose appointment is passed in, for a caller '
  'who is permitted to see that appointment. Returns nothing otherwise. Carries '
  'no billing data: appointments has no money columns and invoices is not joined.';

-- ── 2. The notes written on one of them ──
--
-- appointment_sticky_notes is scoped by the same 20261113210000 migration, so
-- the notes on those visits are hidden too. Gated THROUGH the function above
-- rather than repeating its predicate, so the two cannot drift apart: if the
-- visit is not in the caller's history, there are no notes to read.

create or replace function public.patient_visit_notes(p_appointment_id uuid, p_visit_id uuid)
returns table (
  id uuid,
  title text,
  content text,
  created_at timestamptz,
  author_first_name text,
  author_last_name text
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select n.id, n.title, n.content, n.created_at, s.first_name, s.last_name
    from public.appointment_sticky_notes n
    left join public.staff s on s.id = n.created_by
   where n.appointment_id = p_visit_id
     and exists (
       select 1 from public.patient_visit_history(p_appointment_id) h
        where h.id = p_visit_id
     )
   order by n.created_at desc
$fn$;

comment on function public.patient_visit_notes(uuid, uuid) is
  'Notes on one earlier visit of the same patient, gated through '
  'patient_visit_history so the two share a single rule.';

-- ── 3. Who may call them ──

revoke all on function public.patient_visit_history(uuid) from public, anon;
revoke all on function public.patient_visit_notes(uuid, uuid) from public, anon;
grant execute on function public.patient_visit_history(uuid) to authenticated, service_role;
grant execute on function public.patient_visit_notes(uuid, uuid) to authenticated, service_role;
