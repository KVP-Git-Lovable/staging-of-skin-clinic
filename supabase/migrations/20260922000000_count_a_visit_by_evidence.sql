-- Count a visit the patient actually made, even when Salesforce still calls the
-- appointment "Confirmed".
--
-- 7,646 appointments are in the past and still carry status 'Confirmed', the
-- oldest from 2020-08-01. 3,330 of them have a paid invoice against them - the
-- patient came, was treated and paid, and nobody ever closed the appointment
-- out. 7,638 of the 7,646 arrived that way from Salesforce, so this is the
-- source system's habit, not a bug in this app.
--
-- The visible damage: 730 patients are undercounted and 647 show "0 visits"
-- despite having been invoiced. A patient page reads "Visits 1" beside two paid
-- invoices, which is the kind of number that makes staff stop trusting the page.
--
-- Fixing the statuses here instead would not hold: sf-import-clinical overwrites
-- appointment status from Salesforce whenever the date-range sync runs with
-- refreshExisting on, so the rows would silently revert. Correcting them at
-- source in Salesforce is the real answer, and remains worth doing - this makes
-- the counts right in the meantime, without touching a single clinical record.
--
-- The rule: an appointment counts as a visit when its status says so, OR when it
-- is in the past and carries a paid invoice. Payment is evidence of attendance
-- that no status field can contradict. A future appointment never counts, however
-- it is marked, so a booking taken today cannot inflate anybody's history.

CREATE OR REPLACE FUNCTION public.recalc_patient_visit_rollups(_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;
  UPDATE public.patients p
     SET total_visits          = sub.visits,
         days_since_last_visit = sub.days_since,
         last_visit_date       = sub.last_visit
    FROM (
      SELECT count(*) FILTER (WHERE attended)                       AS visits,
             max(start_time) FILTER (WHERE attended)                AS last_visit,
             (EXTRACT(day FROM (now() - max(start_time) FILTER (WHERE attended)))::int) AS days_since
        FROM (
          SELECT a.start_time,
                 ( a.status IN ('Completed', 'Checked-in', 'In Progress')
                   OR ( a.start_time < now()
                        AND EXISTS (SELECT 1 FROM public.invoices i
                                     WHERE i.appointment_id = a.id
                                       AND COALESCE(i.paid_amount, 0) > 0) )
                 ) AS attended
            FROM public.appointments a
           WHERE a.patient_id = _patient_id
        ) marked
    ) sub
   WHERE p.id = _patient_id;
END;
$function$;

-- Bring every patient up to date in one pass, rather than waiting for each to be
-- touched by the trigger. Fires update_patients_updated_at and log_field_history
-- on the rows that actually change, which is accepted for the same reason as the
-- last-visit backfill: the alternative is disabling triggers on a live table.
WITH marked AS (
  SELECT a.patient_id, a.start_time,
         ( a.status IN ('Completed', 'Checked-in', 'In Progress')
           OR ( a.start_time < now()
                AND EXISTS (SELECT 1 FROM public.invoices i
                             WHERE i.appointment_id = a.id
                               AND COALESCE(i.paid_amount, 0) > 0) )
         ) AS attended
    FROM public.appointments a
   WHERE a.patient_id IS NOT NULL
), agg AS (
  SELECT patient_id,
         count(*) FILTER (WHERE attended) AS visits,
         max(start_time) FILTER (WHERE attended) AS last_visit
    FROM marked GROUP BY patient_id
)
UPDATE public.patients p
   SET total_visits          = agg.visits,
       last_visit_date       = agg.last_visit,
       days_since_last_visit = (EXTRACT(day FROM (now() - agg.last_visit))::int)
  FROM agg
 WHERE p.id = agg.patient_id
   AND ( p.total_visits    IS DISTINCT FROM agg.visits
      OR p.last_visit_date IS DISTINCT FROM agg.last_visit );
