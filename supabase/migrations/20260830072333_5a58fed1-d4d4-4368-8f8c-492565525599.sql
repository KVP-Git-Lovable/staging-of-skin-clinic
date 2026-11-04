
REVOKE EXECUTE ON FUNCTION public.appointments_rollup_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.invoices_rollup_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_patient_visit_rollups(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_patient_invoice_rollups(uuid) FROM PUBLIC, anon, authenticated;
