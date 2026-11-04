-- The appointments list opened with the last patient of the day at the top.
--
-- list_views.sort_by defaults to 'created_at' and sort_direction to 'desc'
-- (20260818_create_list_views.sql:9-10), and the View editor opens pre-set to
-- the same, so every saved appointment view was stored that way without anyone
-- choosing it - all seven of them.
--
-- No list offers created_at as a column, so it could never have been a real
-- choice, but it was still applied: it fell through to start_time and took the
-- stored "desc" with it. And because the active view id is remembered across
-- navigation while the sort is not, returning to the module re-imposed it every
-- time, which is why a manual sort back to morning would not stick.
--
-- Appointments.tsx now ignores a sort naming a column the list cannot sort on,
-- so this is not needed for correctness. It is here so the stored row and the
-- behaviour agree, and so the View editor stops showing a blank "Sort by" with
-- "Descending" beside it.
--
-- Scoped to rows still holding the untouched default, so a sort anyone did pick
-- deliberately is left alone.

update public.list_views
   set sort_by = 'start_time',
       sort_direction = 'asc'
 where section = 'appointments'
   and sort_by = 'created_at';
