-- The nurse role, back as it was.
--
-- On 18 November 20261118060000_what_a_nurse_and_a_pharmacist_open switched
-- on patients, procedures and photos for the Nurse role, after Akash reported
-- the app as blank. The clinic has now looked at that menu and asked for the
-- earlier set back: a nurse opens the day's appointments and marks her own
-- attendance, and the patient record is not hers to read.
--
-- Three rows, view back off, exactly the state they held before the 18th:
--
--   patients    the record itself, and /patients/:id behind it
--   procedures  the "Prescriptions" menu entry and the page it opens
--   photos      the clinical photo library
--
-- What the nurse keeps, untouched here: dashboard, appointments, attendance
-- and leave - so checking in and out is unaffected, and so is the day's list.
--
-- The route guards read the same module key as the sidebar does
-- (ProtectedRoute in src/App.tsx), so this closes the pages as well as the
-- menu entries; it is not a menu that merely hides them. The rows themselves
-- stay readable at the database to any active staff member, as every clinic
-- table is by design - this is the application's answer to who opens what,
-- which is the level the clinic sets it at in Admin > User Management.
--
-- Deliberately NOT touched: the Pharmacist half of the 18 November change.
-- Aruna's pharmacy, vendors, categories, units and portal orders stay as they
-- are. Her pharmacy row had read can_view = false since 15 April and that was
-- the whole reason her app was empty; taking it away again would put her back
-- where she started. If the clinic wants that rolled back too, it is a
-- separate decision and they can say so.
--
-- Reversible: re-running the 18 November migration restores these three.

update public.role_module_permissions p
   set can_view = false, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and lower(r.name) = 'nurse'
   and p.module_key in ('patients', 'procedures', 'photos');
