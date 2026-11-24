-- What a nurse and a pharmacist open.
--
-- Akash was added as a Nurse and Aruna as a Pharmacist on 13 November, and
-- both reported the app as blank. Neither account was broken: both are active,
-- both signed in successfully. Their roles simply had almost nothing switched
-- on.
--
--   Nurse       appointments, attendance, dashboard, leave  - no patient record
--   Pharmacist  attendance, dashboard, leave                - no Pharmacy at all
--
-- The pharmacist could not open the pharmacy. That row has read can_view =
-- false since 15 April; nobody had been on the role to notice.
--
-- This is the same kind of change as 20261115060000_what_a_receptionist_opens
-- and 20261115120000_what_a_manager_opens: permission rows, no schema, no code.
-- Every line here can be unticked afterwards in Admin > User Management, which
-- writes this same table.
--
-- Nothing is granted beyond each role's own work:
--   - no delete anywhere;
--   - the nurse reads clinical records and changes none of them;
--   - the pharmacist gets her own stock at the level the Doctor role already
--     holds on vendors, categories and units (view, create, edit, no delete);
--   - no billing for either, and no patient record for the pharmacist.

-- ── The nurse reads the record in front of her ──

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, k, true, false, false, false
  from public.user_roles_config r
 cross join unnest(array['patients', 'procedures', 'photos']) k
 where lower(r.name) = 'nurse'
on conflict (role_id, module_key) do update
   set can_view = true, can_create = false, can_edit = false, can_delete = false;

-- ── The pharmacist runs the pharmacy ──
--
-- View, create and edit, because a pharmacist who may only look at the stock
-- cannot do the job. Delete stays off, as it is for the Doctor role on these.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, k, true, true, true, false
  from public.user_roles_config r
 cross join unnest(array['pharmacy', 'vendors', 'category_master', 'unit_master']) k
 where lower(r.name) = 'pharmacist'
on conflict (role_id, module_key) do update
   set can_view = true, can_create = true, can_edit = true, can_delete = false;

-- The patients' shop orders she fulfils. Read-only: the order is the patient's.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, 'portal_orders', true, false, false, false
  from public.user_roles_config r
 where lower(r.name) = 'pharmacist'
on conflict (role_id, module_key) do update
   set can_view = true, can_create = false, can_edit = false, can_delete = false;

-- Deliberately untouched: Receptionist and Manager are in the same state
-- (attendance, dashboard, leave only), and a receptionist cannot open a
-- patient or an appointment. Raised with the clinic rather than changed here,
-- because who sees a patient record is theirs to decide, not a migration's.
