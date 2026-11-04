-- Who moved this appointment, and when?
--
-- Until now the answer was: nobody knows. log_field_history is attached to
-- appointments, but it reads history_tracking_config to decide what to record
-- and that table had NO ROWS AT ALL, so it returned early every time and
-- field_history held zero appointment rows. When a morning of reschedules was
-- overwritten there was no record of what the new dates had been, and the only
-- way back was a point-in-time restore.
--
-- One row fixes that. The trigger and the table were already there.

insert into public.history_tracking_config (object_key, is_enabled, tracked_fields)
values ('appointments', true, array['start_time','end_time','status','staff_id'])
on conflict (object_key) do update
  set is_enabled = true,
      tracked_fields = excluded.tracked_fields,
      updated_at = now();
