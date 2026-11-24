-- The pharmacist role, back as it was.
--
-- The other half of this morning's rollback. 20261119060000 put the Nurse
-- role back to its earlier set; the clinic looked at Aruna's menu and asked
-- for the same for the Pharmacist, so the 18 November grant comes off too.
--
-- Five rows, back to the state recorded before that change - every flag off,
-- which is how they had stood since 15 April:
--
--   pharmacy         the Pharmacy page
--   vendors          \
--   category_master   >  the Master Data group
--   unit_master      /
--   portal_orders    the Others > Portal Orders entry
--
-- What she keeps: dashboard, attendance and leave. Her day still starts and
-- ends on the dashboard, and My Attendance is where it was.
--
-- Said once and not repeated: the pharmacy row has read can_view = false
-- since 15 April, which is why her app was empty when she first signed in on
-- 13 November. Putting it back means a pharmacist who cannot open the
-- pharmacy. The clinic has been told that and has asked for it twice, so it
-- is their call and this records it rather than argues with it.
--
-- Reversible: re-running 20261118060000 grants all five again.

update public.role_module_permissions p
   set can_view = false, can_create = false, can_edit = false, can_delete = false
  from public.user_roles_config r
 where r.id = p.role_id
   and lower(r.name) = 'pharmacist'
   and p.module_key in ('pharmacy', 'vendors', 'category_master', 'unit_master', 'portal_orders');
