-- A visit holds a service once.
--
-- Doctors reported a treatment they entered once appearing twice: twice in the
-- Procedure Details table of the printed prescription, twice in the visit's
-- name ("SCALP BOOSTER, SCALP BOOSTER"), and - because the Special
-- Instructions block is hidden only while the visit's own text matches its
-- service lines - a Special Instructions section nobody had written.
--
-- All three are the same fault: the visit holding the service twice. Three
-- separate routes that created such a copy have been fixed in the screens, and
-- one still got through. So the rule stops depending on any screen getting it
-- right: a second copy cannot be stored at all.
--
-- Matching ignores case and surrounding spaces, because "SCALP BOOSTER" and
-- " scalp booster " are the same treatment to everyone except a byte
-- comparison. Nothing is deleted here - the existing duplicates were merged in
-- 20261012170000 and the data satisfies this already.
CREATE UNIQUE INDEX IF NOT EXISTS procedure_services_one_service_per_visit
  ON public.procedure_services (procedure_id, lower(btrim(service_name)));
