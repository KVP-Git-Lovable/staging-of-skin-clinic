-- Who changed this staff record, and when.
--
-- Yesterday someone renamed a staff record and changed its role, and deleted
-- another one. The app recorded neither change. It had to be pieced together
-- from the Trash row and from a snapshot that happened to exist - without that
-- snapshot the rename would have been unexplainable.
--
-- Nothing new is built here. public.log_field_history() is already an
-- AFTER UPDATE trigger on public.staff, along with seventeen other tables. It
-- looks up public.history_tracking_config by table name and returns
-- immediately if there is no row, or it is disabled, or its tracked_fields is
-- empty. For staff there was no row, so the trigger fired 
-- and did nothing, every time. That is the whole of the bug.
--
-- The deletion half needs nothing: log_field_history fires on UPDATE only, and
-- deletions already go to trash_items, which keeps record_data, deleted_by,
-- deleted_by_name and deleted_at. That is how yesterday's deletion was found.
--
-- Backward-compatible with the currently published build: one data row and one
-- trigger. Nothing renamed, nothing dropped, no column added, no new NOT NULL,
-- no second foreign key. Both halves take effect on the clinic the moment this
-- is applied, with no publish, because the trigger already lives in the
-- database the published build talks to.

-- ── 1. Switch tracking on for staff ──
--
-- Nine fields, each one chosen because a silent change to it is the hazard:
--
--   first_name, last_name  the rename
--   role                   the role change (the text column the screens show)
--   role_id                the column that actually grants permissions
--   is_active              how a login is switched off
--   auth_user_id           re-pointing a record at a different login
--   email, phone, specialization   the identity on the record
--
-- Well under MAX_TRACKED_FIELDS (20) in src/lib/history.ts. Every name here is
-- a real column on public.staff - a typo would write nothing at all, silently,
-- so src/lib/staffHistory.test.ts checks each against the generated types.
--
-- on conflict ... do update, so this is re-runnable and so re-applying it does
-- not fight an admin who has since edited the list at /admin/history-tracking.

insert into public.history_tracking_config (object_key, is_enabled, tracked_fields)
values (
  'staff',
  true,
  array[
    'first_name',
    'last_name',
    'role',
    'role_id',
    'is_active',
    'auth_user_id',
    'email',
    'phone',
    'specialization'
  ]
)
on conflict (object_key) do update
  set is_enabled     = excluded.is_enabled,
      tracked_fields = excluded.tracked_fields;

-- ── 2. Make staff.updated_at tell the truth ──
--
-- The two triggers on staff were log_field_history and stamp_audit_user, and
-- neither touched updated_at. The admin record renamed twice in two days still
-- read updated_at = created_at = 2026-05-06. stamp_audit_user does maintain
-- updated_by, but that is one slot each change overwrites: it names the most
-- recent person and never says when.
--
-- Same function history_tracking_config itself already uses. The only
-- behaviour change is that the column starts moving; nothing in src/ reads
-- staff.updated_at, so no screen changes because of it.

drop trigger if exists update_staff_updated_at on public.staff;
create trigger update_staff_updated_at
  before update on public.staff
  for each row execute function public.update_updated_at_column();
