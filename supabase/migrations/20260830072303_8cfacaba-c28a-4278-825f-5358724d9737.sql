
CREATE OR REPLACE FUNCTION public.recalc_patient_visit_rollups(_patient_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;
  UPDATE public.patients p
     SET total_visits = sub.visits,
         days_since_last_visit = sub.days_since
    FROM (
      SELECT count(*) FILTER (WHERE status = 'Completed') AS visits,
             (EXTRACT(day FROM (now() - max(start_time) FILTER (WHERE status = 'Completed')))::int) AS days_since
        FROM public.appointments WHERE patient_id = _patient_id
    ) sub
   WHERE p.id = _patient_id;
END; $$;

CREATE OR REPLACE FUNCTION public.recalc_patient_invoice_rollups(_patient_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _patient_id IS NULL THEN RETURN; END IF;
  UPDATE public.patients p
     SET lifetime_value = COALESCE((SELECT sum(COALESCE(total_amount, 0)) FROM public.invoices WHERE patient_id = _patient_id), 0)
   WHERE p.id = _patient_id;
END; $$;

CREATE OR REPLACE FUNCTION public.appointments_rollup_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.recalc_patient_visit_rollups(OLD.patient_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalc_patient_visit_rollups(NEW.patient_id); END IF;
  RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.invoices_rollup_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN PERFORM public.recalc_patient_invoice_rollups(OLD.patient_id); END IF;
  IF TG_OP <> 'DELETE' THEN PERFORM public.recalc_patient_invoice_rollups(NEW.patient_id); END IF;
  RETURN NULL;
END; $$;

DROP TRIGGER IF EXISTS appointments_rollup ON public.appointments;
CREATE TRIGGER appointments_rollup AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.appointments_rollup_trigger();

DROP TRIGGER IF EXISTS invoices_rollup ON public.invoices;
CREATE TRIGGER invoices_rollup AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_rollup_trigger();

REVOKE EXECUTE ON FUNCTION public.recalc_patient_visit_rollups(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_patient_invoice_rollups(uuid) FROM PUBLIC, anon, authenticated;
