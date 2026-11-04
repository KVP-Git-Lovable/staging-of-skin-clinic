-- Make total_visits, last_visit_date and days_since_last_visit un-corruptable.
--
-- These three columns are derived: there is exactly one correct definition of a
-- visit, and recalc_patient_visit_rollups holds it. Nothing else has any
-- business setting them.
--
-- patient-engagement used to write them too, with a different rule (status
-- alone, ignoring a past appointment with a paid invoice). That write was
-- removed in commit 8bfbf30 and origin/main no longer contains it. The function
-- has since been deployed from main twice, and the deployed copy still behaves
-- like the old one: 37 patients were found holding a total_visits exactly equal
-- to the old status-only count, every one of them written in the same second
-- that patient-engagement last ran. 54 patients had already been corrected by
-- hand earlier the same day and were corrupted again within the hour.
--
-- This is the third recorded instance of a stale deploy in this project;
-- .lovable-sync documents the other two. Correcting the rows again would last
-- until the next page view, so the database stops trusting the caller instead.
-- Whatever any edge function writes into these columns, the stored value is the
-- computed one.
--
-- Cost is nil on the paths that matter: the guard only runs when one of the
-- three columns is actually being changed, so the bulk name and demographics
-- imports - which touch 27k rows and never these columns - skip it entirely.
-- recalc_patient_visit_rollups writes the same value the guard computes, so the
-- correct writer passes straight through unchanged.

CREATE OR REPLACE FUNCTION public.guard_patient_visit_rollups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_visits     integer;
  v_last_visit timestamptz;
BEGIN
  -- Only look when someone is actually trying to change one of these.
  IF TG_OP = 'UPDATE'
     AND NEW.total_visits          IS NOT DISTINCT FROM OLD.total_visits
     AND NEW.last_visit_date       IS NOT DISTINCT FROM OLD.last_visit_date
     AND NEW.days_since_last_visit IS NOT DISTINCT FROM OLD.days_since_last_visit
  THEN
    RETURN NEW;
  END IF;

  -- The one definition of a visit: the status says so, or it is in the past and
  -- carries a paid invoice. Kept identical to recalc_patient_visit_rollups.
  SELECT count(*) FILTER (WHERE attended),
         max(start_time) FILTER (WHERE attended)
    INTO v_visits, v_last_visit
    FROM (
      SELECT a.start_time,
             ( a.status IN ('Completed', 'Checked-in', 'In Progress')
               OR ( a.start_time < now()
                    AND EXISTS (SELECT 1 FROM public.invoices i
                                 WHERE i.appointment_id = a.id
                                   AND COALESCE(i.paid_amount, 0) > 0) )
             ) AS attended
        FROM public.appointments a
       WHERE a.patient_id = NEW.id
    ) marked;

  NEW.total_visits          := COALESCE(v_visits, 0);
  NEW.last_visit_date       := v_last_visit;
  NEW.days_since_last_visit := CASE
    WHEN v_last_visit IS NULL THEN NULL
    ELSE GREATEST(0, EXTRACT(day FROM (now() - v_last_visit))::int) END;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_patient_visit_rollups ON public.patients;
CREATE TRIGGER guard_patient_visit_rollups
  BEFORE INSERT OR UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.guard_patient_visit_rollups();

-- Repair whatever is wrong right now. Touching total_visits makes the guard
-- itself compute the correct value, so this needs no rule of its own.
UPDATE public.patients SET total_visits = -1
 WHERE id IN (
   SELECT p.id
     FROM public.patients p
     JOIN ( SELECT a.patient_id,
                   count(*) FILTER (WHERE
                     a.status IN ('Completed', 'Checked-in', 'In Progress')
                     OR ( a.start_time < now()
                          AND EXISTS (SELECT 1 FROM public.invoices i
                                       WHERE i.appointment_id = a.id
                                         AND COALESCE(i.paid_amount, 0) > 0) )) AS should_be
              FROM public.appointments a
             WHERE a.patient_id IS NOT NULL
             GROUP BY a.patient_id ) agg ON agg.patient_id = p.id
    WHERE p.total_visits IS DISTINCT FROM agg.should_be
 );
