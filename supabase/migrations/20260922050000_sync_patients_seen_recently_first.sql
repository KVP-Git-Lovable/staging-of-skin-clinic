-- Pull a patient's bills in on the day they are seen, not four days later.
--
-- Yesterday's appointment list showed the visits but almost no Bill Amounts, and
-- the dashboard's total for the day fell well short of the ~Rs1,66,322
-- Salesforce holds. Nothing was lost - the bills had simply never been asked for.
--
-- Why: an invoice is only ever imported as a side effect of syncing its PATIENT.
-- sf-import-clinical walks patients and pulls their Billing__c rows; nothing
-- fetches billings by date. sf_clinical_catchup rotates patients
-- oldest-sync-first, 20 every 5 minutes, so each of the ~27,000 comes round
-- about every 4-5 days. An appointment booked last week was imported on some
-- earlier rotation, but the bill raised at the visit itself is not fetched until
-- that patient's next turn. Hence a day that reads as visits without money, and
-- fills in gradually over the following days.
--
-- The fix lets the day's patients jump the queue. Two arms, priority first:
--
--   A. Seen in the last _seen_days (the visit has actually started), where the
--      last sync predates that visit by less than _bill_window_hours - so the
--      bill raised at it cannot yet have been fetched. No staleness gate: a
--      patient synced this morning still qualifies if seen this afternoon.
--   B. The existing rotation - stalest first, older than _stale_days - which
--      keeps the whole base moving and reaches whatever arm A cannot see.
--
-- Two bounds stop arm A monopolising the budget:
--
--   * _cooldown_hours, so a patient is revisited a few times across the day
--     rather than on every five-minute tick;
--   * _bill_window_hours, so once a sync lands that far after the visit began,
--     the row stops qualifying at all.
--
-- A clinic day of ~54 appointments therefore costs a few hundred extra syncs
-- against a budget of ~5,760 a day, and the day's bills land within minutes
-- instead of days.
--
-- Still the plain walk, not mode=recent, so this only ever inserts records
-- carrying a new sf_id and never overwrites an appointment's status. That is
-- what makes it safe to run unattended.
--
-- Not covered by arm A: a bill Salesforce raised with no appointment in this app
-- at all - a walk-in billed directly. Only the date-window sync asks Billing__c
-- by date ("Bring in appointments by date" in the sync panel). Arm B reaches
-- those patients on the ordinary rotation.

-- The old function takes two arguments; this one takes five. In Postgres a
-- function is identified by name AND argument types, so CREATE OR REPLACE would
-- leave BOTH in place - and the cron entry's `sf_clinical_catchup(20, 3)` would
-- then fail with "function is not unique", stopping every Salesforce sync. Drop
-- the two-argument version first so the call resolves to this one by default.
DROP FUNCTION IF EXISTS public.sf_clinical_catchup(integer, integer);

CREATE OR REPLACE FUNCTION public.sf_clinical_catchup(
  _batch integer DEFAULT 20,
  _stale_days integer DEFAULT 3,
  _seen_days integer DEFAULT 3,
  _cooldown_hours integer DEFAULT 2,
  _bill_window_hours integer DEFAULT 6
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_marked integer := 0;
BEGIN
  WITH candidates AS (
    -- Arm A: seen in the last few days, the visit has begun, and we have not
    -- looked since long enough after it for the bill to have been raised.
    SELECT p.id, 0 AS priority, p.sf_clinical_synced_at AS ordering
      FROM public.patients p
     WHERE p.sf_id IS NOT NULL
       AND p.sf_clinical_synced_at IS NOT NULL
       AND p.sf_clinical_synced_at < now() - make_interval(hours => _cooldown_hours)
       AND EXISTS (
         SELECT 1 FROM public.appointments a
          WHERE a.patient_id = p.id
            AND a.start_time >= now() - make_interval(days => _seen_days)
            AND a.start_time <= now()
            AND p.sf_clinical_synced_at
                  < a.start_time + make_interval(hours => _bill_window_hours))

    UNION ALL

    -- Arm B: the existing rotation, so the whole base keeps moving.
    SELECT p.id, 1 AS priority, p.sf_clinical_synced_at AS ordering
      FROM public.patients p
     WHERE p.sf_id IS NOT NULL
       AND p.sf_clinical_synced_at IS NOT NULL
       AND p.sf_clinical_synced_at < now() - make_interval(days => _stale_days)
  ), picked AS (
    -- A patient can satisfy both arms. Collapse to one row each, keeping the
    -- better priority, so a duplicate cannot eat two slots of the batch.
    SELECT id
      FROM candidates
     GROUP BY id
     ORDER BY min(priority) ASC, min(ordering) ASC
     LIMIT _batch
  ), upd AS (
    UPDATE public.patients p
       SET sf_clinical_synced_at = NULL
      FROM picked s
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

-- Arm A's EXISTS looks up a patient's appointments by date on every tick.
CREATE INDEX IF NOT EXISTS idx_appointments_patient_start
  ON public.appointments (patient_id, start_time);

-- The cron entry calls sf_clinical_catchup(20, 3); the new arguments default,
-- so the existing schedule keeps working unchanged and needs no re-registering.
