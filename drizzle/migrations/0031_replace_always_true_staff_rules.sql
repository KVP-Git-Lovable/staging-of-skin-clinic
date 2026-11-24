-- Replace always-true access rules for signed-in users with an explicit active-staff check.
-- Behaviour for staff is unchanged: every table below already carries the RESTRICTIVE
-- signed_in_must_be_staff rule. Rules for anon/public (shop, portal, surveys) are not touched.
DO $mig$
DECLARE
  r record;
  clause text;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.tablename, p.policyname, p.qual, p.with_check
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.permissive = 'PERMISSIVE'
      AND p.roles = ARRAY['authenticated']::name[]
      AND (p.qual = 'true' OR p.with_check = 'true')
      AND p.tablename IN ('ai_repository','appointment_sticky_notes','appointments','asset_issues','asset_service_links','assets','attendance_config','campaign_updates','campaigns','category_master','clinic_settings','currency_settings','custom_field_sections','custom_fields','dashboard_pins','doctors','duplicate_alerts','duplicate_rules','expense_categories','expenses','external_doctors','field_history','followup_opens','google_review_opens','history_tracking_config','invoices','knowledge_article_categories','patient_campaigns','patient_family_members','patient_feedback','patient_feedback_backup_20261105','patient_feedback_backup_20261110','patient_feedback_revisions','patient_feedback_revisions_backup_20261105','patient_feedback_revisions_backup_20261110','patient_pharma_requests','patient_photos','patients','pharma_bill_items','pharma_bills','pharma_inventory','pharma_product_units','pharma_products','portal_order_items','portal_orders','portal_settings','prescriptions','problem_areas','procedure_attachments','procedure_services','procedure_sticky_notes','procedures','product_prices','report_folders','role_module_permissions','saved_reports','service_medicines','services','sf_price_book_entries','staff','staff_aspirations','staff_education','staff_experience','staff_requests','staff_roles','survey_assignments','survey_questions','survey_responses','survey_template_products','survey_template_services','survey_templates','tax_master','tax_master_products','tax_master_services','therapy_notes_retired_20260918','trash_items','trash_settings','unit_master','user_roles_config','validation_rules','vendor_contacts','vendors','week_off_config','whatsapp_conversations','working_hours')
  LOOP
    clause := '';
    IF r.qual = 'true' THEN
      clause := clause || ' USING ((SELECT public.is_active_staff()))';
    END IF;
    IF r.with_check = 'true' THEN
      clause := clause || ' WITH CHECK ((SELECT public.is_active_staff()))';
    END IF;
    EXECUTE format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename) || clause;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'rewrote % policies', n;
END
$mig$;

-- File storage: only signed-in active staff may add, replace or delete files. Reads are unchanged.
DROP POLICY IF EXISTS "Allow upload product images" ON storage.objects;
CREATE POLICY "Allow upload product images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Allow update product images" ON storage.objects;
CREATE POLICY "Allow update product images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-images' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()))
  WITH CHECK (bucket_id = 'product-images' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Allow delete product images" ON storage.objects;
CREATE POLICY "Allow delete product images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Authenticated can upload invoice pdfs" ON storage.objects;
CREATE POLICY "Authenticated can upload invoice pdfs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Authenticated can update invoice pdfs" ON storage.objects;
CREATE POLICY "Authenticated can update invoice pdfs" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoices' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()))
  WITH CHECK (bucket_id = 'invoices' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Authenticated users can upload patient photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload patient photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'patient-photos' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Authenticated users can delete patient photos" ON storage.objects;
CREATE POLICY "Authenticated users can delete patient photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'patient-photos' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Auth upload expense-attachments" ON storage.objects;
CREATE POLICY "Auth upload expense-attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-attachments' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Auth delete expense-attachments" ON storage.objects;
CREATE POLICY "Auth delete expense-attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-attachments' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));

DROP POLICY IF EXISTS "Auth insert procedure-attachments" ON storage.objects;
CREATE POLICY "Auth insert procedure-attachments" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'procedure-attachments' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));
DROP POLICY IF EXISTS "Auth delete procedure-attachments" ON storage.objects;
CREATE POLICY "Auth delete procedure-attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'procedure-attachments' AND public.current_staff_id() IS NOT NULL AND (SELECT public.is_active_staff()));