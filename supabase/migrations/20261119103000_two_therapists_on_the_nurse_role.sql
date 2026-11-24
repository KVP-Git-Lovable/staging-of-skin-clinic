-- Reena and Rita are therapists. Their role said Nurse.
--
-- The clinic saw "Nurse" on the badge under Reena Shibi's name and reported
-- it as a wrong label. It was not a label: the badge shows the role the app
-- actually runs the person on (useAuth reads user_roles_config through
-- staff.role_id, and that same row decides every module and every scope).
--
-- Both staff records already read Therapist in staff.role. What was wrong is
-- staff.role_id, which pointed at the Nurse role for both of them - set that
-- way on 17 November, when the new logins were configured. So the record
-- said therapist, the access said nurse, and the two had been apart since.
--
-- It mattered this morning: the Nurse role was rolled back to its earlier
-- set a few hours ago at the clinic's request, and that quietly reached two
-- therapists who were never meant to be on it.
--
-- ── What this changes, and what it does not ──
--
-- Only the two role_id values. Nothing about the permission rows themselves.
--
-- Nothing they can open changes today: the Therapist role and the Nurse role
-- currently hold exactly the same modules (appointments, attendance,
-- dashboard, my-appointments, leave) and exactly the same scopes -
-- appointment_scope 'assigned', data_scope 'all' - so sees_all_appointments()
-- and has_full_data_scope(), which both read user_roles_config through
-- role_id, answer the same before and after. Their appointment lists are
-- unchanged.
--
-- What it changes is who they follow from here: an edit to the Therapist role
-- now reaches them, and an edit to the Nurse role no longer does. Which is
-- the point - they are therapists, and they sit with Abhinethri and Suchitra.
--
-- Left alone deliberately, because these look intended rather than wrong:
--   Dr Vindhya Pai   staff.role Doctor, on the Admin role
--   Swathi .         staff.role Admin,  on the Manager role
--   Therapist -      staff.role Staff,  on the Therapist role (a placeholder)
-- Raised with the clinic rather than changed here.

update public.staff s
   set role_id = (select id from public.user_roles_config where lower(name) = 'therapist')
 where s.is_active
   and lower(coalesce(s.role, '')) = 'therapist'
   and s.role_id = (select id from public.user_roles_config where lower(name) = 'nurse');
