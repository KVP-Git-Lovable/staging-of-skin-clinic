-- Only those two decide.
--
-- 20261114060000 made leave requests and attendance corrections notify
-- whoever carries staff.approves_requests, which is Dr Vindhya Pai and Suyog
-- and nobody else. Deciding was left wider: both approve/reject policies ask
-- public.is_admin_user(), true for any active staff member whose role is
-- Admin. The clinic has asked for The Skin Clinic account to have neither
-- the notifications nor the authority - it already had neither notification,
-- and this is the authority half.
--
-- Of the five Admin-role staff this changes one in practice. Swathi has no
-- login and cannot sign in; Test acc is inactive and is_admin_user() already
-- excludes it; Dr Vindhya and Suyog keep what they have.
--
-- Backward-compatible with the published build: two policies repointed at a
-- narrower predicate, no table or column change. The published build's leave
-- page offers Approve to anybody who can open it, so from the moment this is
-- applied that button fails there for The Skin Clinic account - which is the
-- change being asked for, arriving before the screen that hides it.

-- ── The predicate ──
--
-- Shaped after is_admin_user, current_staff_id and sees_all_appointments,
-- which it sits beside.
--
-- The second half is a deliberate safety clause, not an oversight. There is
-- no screen for ticking approves_requests yet, so a clinic that cleared both
-- approvers would reach a state where no leave can ever be approved and
-- nobody inside the clinic could undo it. With nobody named, any admin may
-- decide - the same reasoning as has_full_data_scope(), which defaults open
-- for exactly this reason. Name one person and it narrows again.

create or replace function public.may_decide_requests()
returns boolean
language sql
stable security definer
set search_path to 'public'
as $fn$
  select exists (
    select 1 from public.staff s
     where s.auth_user_id = auth.uid()
       and s.is_active is not false
       and s.approves_requests
  )
  or not exists (
    select 1 from public.staff s2
     where s2.approves_requests
       and s2.is_active is not false
       and s2.auth_user_id is not null
  ) and public.is_admin_user();
$fn$;

comment on function public.may_decide_requests() is
  'May approve or reject a leave application or an attendance regularisation: an active staff member carrying approves_requests. Falls back to any admin only when NOBODY carries it, so clearing the list cannot lock the clinic out of its own approvals.';

revoke all on function public.may_decide_requests() from public, anon;

-- ── The two decisions ──
--
-- Renamed to say what they now mean. Deliberately NOT moved: leave_types and
-- staff_leave_balances, which are configuration rather than approval, and
-- the delete policies - clearing out a record is administration, and the
-- clinic asked about approving.

drop policy if exists "Only admins decide leave" on public.leave_applications;
drop policy if exists "Only the named approvers decide leave" on public.leave_applications;
create policy "Only the named approvers decide leave"
  on public.leave_applications for update to authenticated
  using ((select public.may_decide_requests()))
  with check ((select public.may_decide_requests()));

drop policy if exists "Only admins decide a regularisation" on public.attendance_regularisations;
drop policy if exists "Only the named approvers decide a regularisation" on public.attendance_regularisations;
create policy "Only the named approvers decide a regularisation"
  on public.attendance_regularisations for update to authenticated
  using ((select public.may_decide_requests()))
  with check ((select public.may_decide_requests()));
