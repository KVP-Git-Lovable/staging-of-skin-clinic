-- 1. Remove anonymous write policies on business/config tables
DROP POLICY IF EXISTS "Allow public insert access to clinic_settings" ON public.clinic_settings;
DROP POLICY IF EXISTS "Allow public update access to clinic_settings" ON public.clinic_settings;

DROP POLICY IF EXISTS "Allow public insert doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow public update doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow public delete doctors" ON public.doctors;

DROP POLICY IF EXISTS "anon all patient_campaigns" ON public.patient_campaigns;

DROP POLICY IF EXISTS "Allow public insert product_prices" ON public.product_prices;
DROP POLICY IF EXISTS "Allow public update product_prices" ON public.product_prices;
DROP POLICY IF EXISTS "Allow public delete product_prices" ON public.product_prices;

DROP POLICY IF EXISTS "Allow public insert services" ON public.services;
DROP POLICY IF EXISTS "Allow public update services" ON public.services;
DROP POLICY IF EXISTS "Allow public delete services" ON public.services;

DROP POLICY IF EXISTS "Allow public insert access to tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Allow public update access to tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Allow public delete access to tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Authenticated users can create tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Authenticated users can update tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Authenticated users can delete tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "Authenticated users can view tax_master" ON public.tax_master;
CREATE POLICY "Auth read tax_master" ON public.tax_master FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert tax_master" ON public.tax_master FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update tax_master" ON public.tax_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth delete tax_master" ON public.tax_master FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Allow public insert access to working_hours" ON public.working_hours;
DROP POLICY IF EXISTS "Allow public update access to working_hours" ON public.working_hours;

-- catalog/config tables
DROP POLICY IF EXISTS "Allow public insert service_medicines" ON public.service_medicines;
DROP POLICY IF EXISTS "Allow public update service_medicines" ON public.service_medicines;
DROP POLICY IF EXISTS "Allow public delete service_medicines" ON public.service_medicines;

DROP POLICY IF EXISTS "anon insert problem_areas" ON public.problem_areas;
DROP POLICY IF EXISTS "anon update problem_areas" ON public.problem_areas;
DROP POLICY IF EXISTS "anon delete problem_areas" ON public.problem_areas;

DROP POLICY IF EXISTS "anon insert survey_templates" ON public.survey_templates;
DROP POLICY IF EXISTS "anon update survey_templates" ON public.survey_templates;
DROP POLICY IF EXISTS "anon delete survey_templates" ON public.survey_templates;

DROP POLICY IF EXISTS "anon insert survey_questions" ON public.survey_questions;
DROP POLICY IF EXISTS "anon update survey_questions" ON public.survey_questions;
DROP POLICY IF EXISTS "anon delete survey_questions" ON public.survey_questions;

DROP POLICY IF EXISTS "anon insert survey_template_products" ON public.survey_template_products;
DROP POLICY IF EXISTS "anon update survey_template_products" ON public.survey_template_products;
DROP POLICY IF EXISTS "anon delete survey_template_products" ON public.survey_template_products;

DROP POLICY IF EXISTS "anon insert survey_template_services" ON public.survey_template_services;
DROP POLICY IF EXISTS "anon update survey_template_services" ON public.survey_template_services;
DROP POLICY IF EXISTS "anon delete survey_template_services" ON public.survey_template_services;

DROP POLICY IF EXISTS "Allow public insert tax_master_services" ON public.tax_master_services;
DROP POLICY IF EXISTS "Allow public update tax_master_services" ON public.tax_master_services;
DROP POLICY IF EXISTS "Allow public delete tax_master_services" ON public.tax_master_services;

DROP POLICY IF EXISTS "anon all tax_master_products" ON public.tax_master_products;
CREATE POLICY "anon read tax_master_products" ON public.tax_master_products FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon all unit_master" ON public.unit_master;
CREATE POLICY "anon read unit_master" ON public.unit_master FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon all category_master" ON public.category_master;
CREATE POLICY "anon read category_master" ON public.category_master FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon all campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "anon all campaign_updates" ON public.campaign_updates;

-- 2. Custom field configuration: authenticated only
DROP POLICY IF EXISTS "anon read custom_fields" ON public.custom_fields;
DROP POLICY IF EXISTS "anon read custom_field_sections" ON public.custom_field_sections;
REVOKE ALL ON public.custom_fields FROM anon;
REVOKE ALL ON public.custom_field_sections FROM anon;

-- 3. Revoke anonymous write privileges at the grant level
REVOKE INSERT, UPDATE, DELETE ON
  public.clinic_settings, public.doctors, public.product_prices, public.services,
  public.tax_master, public.working_hours, public.service_medicines, public.problem_areas,
  public.survey_templates, public.survey_questions, public.survey_template_products,
  public.survey_template_services, public.tax_master_services, public.tax_master_products,
  public.unit_master, public.category_master
FROM anon;
REVOKE ALL ON public.patient_campaigns, public.campaigns, public.campaign_updates FROM anon;

-- 4. Move the admin helper out of the exposed API schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    LEFT JOIN public.user_roles_config r ON r.id = s.role_id
    WHERE s.auth_user_id = auth.uid()
      AND COALESCE(s.is_active, true)
      AND (lower(coalesce(r.name, '')) = 'admin' OR lower(coalesce(s.role, '')) = 'admin')
  );
$function$;
REVOKE ALL ON FUNCTION private.is_admin_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin_staff() TO authenticated, service_role;

DROP POLICY IF EXISTS "Admins can update hsn tax master" ON public.hsn_tax_master;
DROP POLICY IF EXISTS "Admins can delete hsn tax master" ON public.hsn_tax_master;
DROP POLICY IF EXISTS "Admins can insert hsn_tax_master" ON public.hsn_tax_master;
DROP POLICY IF EXISTS "Admins manage user_roles_config" ON public.user_roles_config;
DROP POLICY IF EXISTS "Admins manage role_module_permissions" ON public.role_module_permissions;
DROP POLICY IF EXISTS "Admins manage staff_roles" ON public.staff_roles;

CREATE POLICY "Admins can update hsn tax master" ON public.hsn_tax_master FOR UPDATE TO authenticated USING (private.is_admin_staff()) WITH CHECK (private.is_admin_staff());
CREATE POLICY "Admins can delete hsn tax master" ON public.hsn_tax_master FOR DELETE TO authenticated USING (private.is_admin_staff());
CREATE POLICY "Admins can insert hsn_tax_master" ON public.hsn_tax_master FOR INSERT TO authenticated WITH CHECK (private.is_admin_staff());
CREATE POLICY "Admins manage user_roles_config" ON public.user_roles_config FOR ALL TO authenticated USING (private.is_admin_staff()) WITH CHECK (private.is_admin_staff());
CREATE POLICY "Admins manage role_module_permissions" ON public.role_module_permissions FOR ALL TO authenticated USING (private.is_admin_staff()) WITH CHECK (private.is_admin_staff());
CREATE POLICY "Admins manage staff_roles" ON public.staff_roles FOR ALL TO authenticated USING (private.is_admin_staff()) WITH CHECK (private.is_admin_staff());

-- Admin DDL RPCs: keep callable only by signed-in admins, never anonymous
CREATE OR REPLACE FUNCTION public.add_custom_field_column(_table text, _column text, _sql_type text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.is_admin_staff() THEN
    RAISE EXCEPTION 'Only administrators can create custom fields';
  END IF;
  IF _table NOT IN ('patients','appointments','procedures','invoices','pharma_products') THEN
    RAISE EXCEPTION 'Unsupported object: %', _table;
  END IF;
  IF _column !~ '^cf_[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid column name: %', _column;
  END IF;
  IF _sql_type NOT IN ('text','text[]','integer','numeric','boolean','date','timestamptz') THEN
    RAISE EXCEPTION 'Unsupported field type: %', _sql_type;
  END IF;
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %I %s', _table, _column, _sql_type);
END;
$function$;

CREATE OR REPLACE FUNCTION public.drop_custom_field_column(_table text, _column text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.is_admin_staff() THEN
    RAISE EXCEPTION 'Only administrators can delete custom fields';
  END IF;
  IF _table NOT IN ('patients','appointments','procedures','invoices','pharma_products') THEN
    RAISE EXCEPTION 'Unsupported object: %', _table;
  END IF;
  IF _column !~ '^cf_[a-z0-9_]{1,50}$' THEN
    RAISE EXCEPTION 'Invalid column name: %', _column;
  END IF;
  EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS %I', _table, _column);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_custom_field_column(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.drop_custom_field_column(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_custom_field_column(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.drop_custom_field_column(text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.is_admin_staff();