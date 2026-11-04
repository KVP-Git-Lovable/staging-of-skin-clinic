-- Lock down sensitive tables: authenticated-only access, no anonymous access.
DO $$
DECLARE
  t text;
  p record;
  staff_tables text[] := ARRAY[
    'appointments','attendance_records','patients','patient_family_members','patient_photos',
    'patient_pharma_requests','procedures','prescriptions','invoices','staff','staff_education',
    'staff_experience','staff_aspirations','staff_requests','staff_leave_balances',
    'leave_applications','leave_types','survey_responses','survey_assignments',
    'pharma_bills','pharma_bill_items','vendors','vendor_contacts','expenses','expense_categories',
    'assets','asset_issues','asset_service_links','saved_reports','report_folders','dashboard_pins',
    'therapy_notes','patient_feedback','procedure_attachments','whatsapp_conversations'
  ];
BEGIN
  FOREACH t IN ARRAY staff_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- Portal token / OTP tables: server-side (service role) only, no client access at all.
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_portal_tokens','patient_portal_otps'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Role / permission configuration: readable by signed-in users, writable by admins only.
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_roles_config','role_module_permissions','staff_roles'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY "Signed-in users can read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('CREATE POLICY "Admins manage %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_admin_staff()) WITH CHECK (public.is_admin_staff())', t);
  END LOOP;
END $$;

-- Pharmacy catalog + stock: public shop needs read-only anonymous access; writes require sign-in.
DO $$
DECLARE p record; t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharma_products','pharma_inventory','pharma_product_units'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('CREATE POLICY "Anyone can browse %1$s" ON public.%1$I FOR SELECT USING (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t);
    EXECUTE format('CREATE POLICY "Authenticated staff can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (true)', t);
  END LOOP;
END $$;

-- HSN tax master: only admins may add tax records.
DROP POLICY IF EXISTS "Authenticated can insert hsn_tax_master" ON public.hsn_tax_master;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='hsn_tax_master' AND cmd='INSERT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.hsn_tax_master', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Admins can insert hsn_tax_master"
  ON public.hsn_tax_master FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_staff());
REVOKE ALL ON public.hsn_tax_master FROM anon;

-- Security definer functions: not callable by anonymous visitors.
REVOKE ALL ON FUNCTION public.is_admin_staff() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_staff() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_custom_field_column(text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_custom_field_column(text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.drop_custom_field_column(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.drop_custom_field_column(text, text) TO authenticated, service_role;

-- Storage: block anonymous uploads / overwrites / deletions of sensitive files.
DROP POLICY IF EXISTS "Allow public uploads to patient-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to patient-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from patient-photos" ON storage.objects;
DROP POLICY IF EXISTS "Allow public insert procedure-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete procedure-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Public upload expense-attachments" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can insert attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update attendance photos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view attendance photos" ON storage.objects;

CREATE POLICY "Signed-in users can upload attendance photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'attendance-photos');
CREATE POLICY "Signed-in users can update attendance photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'attendance-photos') WITH CHECK (bucket_id = 'attendance-photos');
CREATE POLICY "Signed-in users can view attendance photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'attendance-photos');