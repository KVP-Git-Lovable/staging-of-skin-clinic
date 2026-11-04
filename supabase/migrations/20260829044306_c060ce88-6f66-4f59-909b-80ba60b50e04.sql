CREATE OR REPLACE FUNCTION public.trash_allowed_object(_object_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT _object_type IN (
    'patients','appointments','procedures','invoices','pharma_products','pharma_bills',
    'expenses','assets','vendors','services','doctors','staff','campaigns','portal_orders',
    'survey_templates','survey_responses','patient_photos','prescriptions','list_views',
    'problem_areas','tax_master','hsn_tax_master','category_master','unit_master','saved_reports'
  );
$$;