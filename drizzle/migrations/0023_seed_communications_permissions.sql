-- Every existing role gets to see the new Communications Center sections.
--
-- ProtectedRoute in src/App.tsx allows a user through when they are an admin, or
-- when permissions[moduleKey].can_view is true, or when their permissions map is
-- completely empty. A non-admin role that already has any role_module_permissions
-- rows therefore falls through to AccessDenied for a brand-new module key - while
-- AppSidebar's canView() currently returns true for everything, so that same user
-- would still SEE the link and only discover the wall after clicking it.
--
-- Seeding can_view here keeps the four new sections reachable for existing roles
-- from the moment they ship. Create/edit/delete stay false on purpose: an admin
-- widens them per role in User Management, which is the screen that owns this
-- table. ON CONFLICT DO NOTHING means re-running this never overwrites a choice
-- an admin has since made, and never touches a key that already has a row.

insert into public.role_module_permissions (role_id, module_key, can_view, can_create, can_edit, can_delete)
select r.id, k.module_key, true, false, false, false
from public.user_roles_config r
cross join (values
  ('leads'),
  ('communications'),
  ('meta'),
  ('meta_connection')
) as k(module_key)
on conflict (role_id, module_key) do nothing;
