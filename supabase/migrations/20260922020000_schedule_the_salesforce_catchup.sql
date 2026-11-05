-- INTENTIONALLY EMPTY IN STAGING.
--
-- In production this migration schedules pg_cron jobs that call production's
-- Salesforce import functions using production's project URL and key.
-- Staging does not run Salesforce sync, and must never call production, so the
-- body is removed here. Do not restore it in this repository.
select 1;
