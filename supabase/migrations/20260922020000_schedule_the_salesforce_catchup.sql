-- Keep Salesforce data flowing in without anyone pressing a button.
--
-- sf-import-clinical walks patients whose sf_clinical_synced_at IS NULL and
-- stamps each one as it finishes. That means a patient is fetched exactly once,
-- ever. 15,168 patients were last looked at more than a week ago, so anything
-- billed or prescribed for them in Salesforce since then was never pulled -
-- not lost, just never asked for. The clinic's question was "no invoice must be
-- missed", and a one-shot import cannot answer it.
--
-- So the database rotates patients back through the walk on a schedule, oldest
-- sync first, using pg_cron to drive it and pg_net to fire the function without
-- blocking the cron worker.
--
-- Why the plain walk and not mode=recent: syncPatient receives
-- refreshExisting = (mode === "recent"), and that branch overwrites appointment
-- status from Salesforce. The plain walk passes false, so it only ever inserts
-- records carrying a new sf_id and leaves everything already here alone. That
-- makes a repeating sync safe to run unattended.
--
-- reset=true is deliberately never used: it deletes the patient's imported
-- appointments, invoices and procedures before re-importing them.
--
-- Rate: 20 patients every 5 minutes, ~5,760 a day, so all 27,041 are revisited
-- roughly every 4-5 days. Only patients whose last sync is older than 3 days are
-- eligible, so a patient synced this morning is not churned again tonight.
--
-- To pause everything: SELECT cron.unschedule('sf-clinical-catchup'); and the
-- same for the two daily jobs. Nothing else depends on them.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- The publishable (anon) key. It is already public - it ships inside the app's
-- JavaScript - and the functions require a valid JWT, which it is.
CREATE OR REPLACE FUNCTION public.sf_fire_function(_path text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT net.http_get(
    url := 'https://brdrkhgfbbrgdkzdfbpr.supabase.co/functions/v1/' || _path,
    headers := jsonb_build_object(
      'Authorization',
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyZHJraGdmYmJyZ2RremRmYnByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMDg5ODMsImV4cCI6MjA4ODU4NDk4M30.YXQSBak0orZy5LiMSw3ZGY1m500l8uGdPEaSDnOGwGE'),
    timeout_milliseconds := 150000
  );
$function$;

-- Mark the stalest patients as needing another look, then fire the importer,
-- which picks them up by the same sf_clinical_synced_at IS NULL rule it already
-- uses. Marking and processing are deliberately the same size, so a backlog
-- cannot build up.
CREATE OR REPLACE FUNCTION public.sf_clinical_catchup(_batch integer DEFAULT 20, _stale_days integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marked integer := 0;
BEGIN
  WITH stale AS (
    SELECT id
      FROM public.patients
     WHERE sf_id IS NOT NULL
       AND sf_clinical_synced_at IS NOT NULL
       AND sf_clinical_synced_at < now() - make_interval(days => _stale_days)
     ORDER BY sf_clinical_synced_at ASC
     LIMIT _batch
  ), upd AS (
    UPDATE public.patients p
       SET sf_clinical_synced_at = NULL
      FROM stale s
     WHERE p.id = s.id
    RETURNING 1
  )
  SELECT count(*) INTO v_marked FROM upd;

  -- Anything already pending counts too, so a run still fires when nothing new
  -- was marked but the queue is not empty.
  IF v_marked = 0 AND NOT EXISTS (
       SELECT 1 FROM public.patients
        WHERE sf_id IS NOT NULL AND sf_clinical_synced_at IS NULL LIMIT 1)
  THEN
    RETURN 0;
  END IF;

  PERFORM public.sf_fire_function('sf-import-clinical?limit=20');
  RETURN v_marked;
END;
$function$;

-- New Salesforce patients carry the highest ids, so the daily jobs start a few
-- hundred short of the newest id we hold rather than re-scanning 27,000 rows.
CREATE OR REPLACE FUNCTION public.sf_tail_cursor(_back integer DEFAULT 500)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT sf_id FROM public.patients
   WHERE sf_id IS NOT NULL
   ORDER BY sf_id DESC
   OFFSET _back LIMIT 1;
$function$;

SELECT cron.unschedule('sf-clinical-catchup') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sf-clinical-catchup');
SELECT cron.unschedule('sf-new-patients')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sf-new-patients');
SELECT cron.unschedule('sf-demographics')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sf-demographics');

-- Existing patients: rolling re-sync, every 5 minutes.
SELECT cron.schedule('sf-clinical-catchup', '*/5 * * * *', $cron$ SELECT public.sf_clinical_catchup(20, 3); $cron$);

-- Brand-new Salesforce patients, and their demographics. Daily, off-hours IST.
SELECT cron.schedule('sf-new-patients', '30 20 * * *',
  $cron$ SELECT public.sf_fire_function('sf-import-all-patients?pages=6&cursor=' || coalesce(public.sf_tail_cursor(500), '')); $cron$);
SELECT cron.schedule('sf-demographics', '45 20 * * *',
  $cron$ SELECT public.sf_fire_function('sf-import-demographics?pages=6&cursor=' || coalesce(public.sf_tail_cursor(500), '')); $cron$);
