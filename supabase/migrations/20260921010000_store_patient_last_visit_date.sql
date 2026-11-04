-- Store the last visit date the rollup already works out.
--
-- recalc_patient_visit_rollups computes max(start_time) over a patient's
-- Completed appointments in order to derive days_since_last_visit, and then
-- discards the value instead of writing it to last_visit_date. So
-- days_since_last_visit is set for 19,019 patients while last_visit_date is set
-- for 770, and 18,316 patients have visits with no date against them. The column
-- exists and the trigger runs; nothing ever filled it.
--
-- That matters beyond the column itself: the patients list wants to lead with
-- the people who have actually been in recently, and it cannot order by a field
-- that is empty for 97% of the table.
--
-- "Visit" stays defined as an attended (Completed) appointment, which is what
-- total_visits already counts and what engagement scoring is built on.

CREATE OR REPLACE FUNCTION public.recalc_patient_visit_rollups(_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;
  UPDATE public.patients p
     SET total_visits          = sub.visits,
         days_since_last_visit = sub.days_since,
         last_visit_date       = sub.last_visit
    FROM (
      SELECT count(*) FILTER (WHERE status = 'Completed')                                        AS visits,
             max(start_time) FILTER (WHERE status = 'Completed')                                 AS last_visit,
             (EXTRACT(day FROM (now() - max(start_time) FILTER (WHERE status = 'Completed')))::int) AS days_since
        FROM public.appointments
       WHERE patient_id = _patient_id
    ) sub
   WHERE p.id = _patient_id;
END;
$$;

-- Backfill the 18,316 patients the trigger should have been keeping current.
--
-- Restricted to rows whose value actually changes, so it writes 19,000-odd rows
-- rather than all 27,083. It still fires update_patients_updated_at and
-- log_field_history on those, which is a one-time churn of updated_at and a
-- history entry each - accepted, because the alternative is disabling triggers
-- on a live table to save a cosmetic field.
UPDATE public.patients p
   SET last_visit_date = sub.last_visit
  FROM (
    SELECT patient_id,
           max(start_time) FILTER (WHERE status = 'Completed') AS last_visit
      FROM public.appointments
     WHERE patient_id IS NOT NULL
     GROUP BY patient_id
  ) sub
 WHERE p.id = sub.patient_id
   AND p.last_visit_date IS DISTINCT FROM sub.last_visit;

-- The list orders by this, newest first, with never-attended patients last.
CREATE INDEX IF NOT EXISTS patients_last_visit_date_desc_idx
  ON public.patients (last_visit_date DESC NULLS LAST);
