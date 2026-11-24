-- A role cannot be deleted while somebody still holds it.
--
-- User Management grew a Delete Role button today, because test roles were
-- piling up with no way to remove them. That button asks politely; this is the
-- rule.
--
-- Why it is needed at all: staff.role_id is ON DELETE SET NULL. Delete a role
-- four nurses hold and Postgres does not complain - it blanks role_id on all
-- four. They keep their logins, quietly lose their permissions, and there is
-- nothing left to put back, because the id that said which role it was is the
-- thing that was erased. A confirmation dialog is no protection against that:
-- it is one careless click, or one call that never goes through the screen.
--
-- Two refusals:
--
--   * a system role - Admin, Doctor, Receptionist, Pharmacist. The app seeds
--     these and assigns them by name; a clinic that deleted Admin could not
--     create another administrator.
--   * a role any staff row still points at, named with the count so whoever
--     hit it knows what to do next.
--
-- role_module_permissions.role_id is ON DELETE CASCADE and stays that way: a
-- role that IS deletable should take its own permission rows with it, and
-- those rows point at nothing else.
--
-- Backward-compatible with the currently published build: nothing is renamed
-- or dropped, no column changes, and the published build has no way to delete
-- a role, so it cannot start failing on this.

create or replace function public.refuse_to_delete_a_role_in_use()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_holders int;
begin
  if coalesce(old.is_system, false) then
    raise exception
      'Role "%" is a system role and cannot be deleted', old.name
      using errcode = 'restrict_violation';
  end if;

  select count(*) into v_holders from public.staff where role_id = old.id;

  if v_holders > 0 then
    raise exception
      'Role "%" is still held by % staff - move them to another role first',
      old.name, v_holders
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$fn$;

comment on function public.refuse_to_delete_a_role_in_use() is
  'Blocks deletion of a system role, or of any role staff.role_id still points at. staff.role_id is ON DELETE SET NULL, so without this a delete silently strips those people of their permissions.';

drop trigger if exists refuse_to_delete_a_role_in_use on public.user_roles_config;
create trigger refuse_to_delete_a_role_in_use
  before delete on public.user_roles_config
  for each row execute function public.refuse_to_delete_a_role_in_use();

-- The trigger runs as its definer so the count is honest whoever is signed in:
-- a role must not look free merely because the caller cannot see the staff
-- holding it.
revoke all on function public.refuse_to_delete_a_role_in_use() from public, anon;
