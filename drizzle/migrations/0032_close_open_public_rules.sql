-- Tables the public pages never read without a staff login: remove the open visitor rules.
DROP POLICY IF EXISTS "anon read tax_master_products" ON public.tax_master_products;
DROP POLICY IF EXISTS "Allow public read access to clinic_settings" ON public.clinic_settings;
DROP POLICY IF EXISTS "Allow public read external_doctors" ON public.external_doctors;
DROP POLICY IF EXISTS "Allow public insert external_doctors" ON public.external_doctors;
DROP POLICY IF EXISTS "Allow public read service_medicines" ON public.service_medicines;
DROP POLICY IF EXISTS "Allow public read tax_master_services" ON public.tax_master_services;
DROP POLICY IF EXISTS "Allow public read doctors" ON public.doctors;
DROP POLICY IF EXISTS "Allow public read product_prices" ON public.product_prices;
DROP POLICY IF EXISTS "anon read unit_master" ON public.unit_master;
DROP POLICY IF EXISTS "Allow public read access to tax_master" ON public.tax_master;
DROP POLICY IF EXISTS "anon read problem_areas" ON public.problem_areas;

-- Cart: only the signed-in shop uses it; visitors get nothing.
DROP POLICY IF EXISTS "Allow public read cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public insert cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public update cart_items" ON public.cart_items;
DROP POLICY IF EXISTS "Allow public delete cart_items" ON public.cart_items;

-- Portal orders now go through the session-checked portal-data function.
DROP POLICY IF EXISTS "Allow public read portal_orders" ON public.portal_orders;
DROP POLICY IF EXISTS "Allow public insert portal_orders" ON public.portal_orders;
DROP POLICY IF EXISTS "Allow public update portal_orders" ON public.portal_orders;
DROP POLICY IF EXISTS "Allow public read portal_order_items" ON public.portal_order_items;
DROP POLICY IF EXISTS "Allow public insert portal_order_items" ON public.portal_order_items;

-- Product catalogue: staff keep full read; visitors see only products that have not expired.
DROP POLICY IF EXISTS "Anyone can browse pharma_products" ON public.pharma_products;
CREATE POLICY "Staff read pharma_products" ON public.pharma_products
  FOR SELECT TO authenticated USING ((SELECT public.is_active_staff()));
CREATE POLICY "Visitors browse current pharma_products" ON public.pharma_products
  FOR SELECT TO anon USING (expiry_date IS NULL OR expiry_date >= CURRENT_DATE);

DROP POLICY IF EXISTS "Anyone can browse pharma_inventory" ON public.pharma_inventory;
CREATE POLICY "Staff read pharma_inventory" ON public.pharma_inventory
  FOR SELECT TO authenticated USING ((SELECT public.is_active_staff()));
CREATE POLICY "Visitors see in-stock pharma_inventory" ON public.pharma_inventory
  FOR SELECT TO anon USING (quantity > 0);

DROP POLICY IF EXISTS "Anyone can browse pharma_product_units" ON public.pharma_product_units;
CREATE POLICY "Staff read pharma_product_units" ON public.pharma_product_units
  FOR SELECT TO authenticated USING ((SELECT public.is_active_staff()));
CREATE POLICY "Visitors see units of visible products" ON public.pharma_product_units
  FOR SELECT TO anon USING (
    is_active AND EXISTS (SELECT 1 FROM public.pharma_products p WHERE p.id = pharma_product_units.product_id)
  );

-- Portal module switches: visitors read only the single live settings row.
CREATE OR REPLACE FUNCTION public.live_portal_settings_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.portal_settings ORDER BY created_at, id LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.live_portal_settings_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.live_portal_settings_id() TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "Allow public read portal_settings" ON public.portal_settings;
CREATE POLICY "Visitors read live portal_settings" ON public.portal_settings
  FOR SELECT TO anon USING (id = public.live_portal_settings_id());

-- Clinic hours: visitors see open days only (what the portal shows).
DROP POLICY IF EXISTS "Allow public read access to working_hours" ON public.working_hours;
CREATE POLICY "Visitors read open working_hours" ON public.working_hours
  FOR SELECT TO anon USING (is_open = true);

-- Surveys: visitors read only active templates and what belongs to them.
DROP POLICY IF EXISTS "anon read survey_templates" ON public.survey_templates;
CREATE POLICY "Visitors read active survey_templates" ON public.survey_templates
  FOR SELECT TO anon USING (is_active = true);

DROP POLICY IF EXISTS "anon read survey_questions" ON public.survey_questions;
CREATE POLICY "Visitors read questions of active templates" ON public.survey_questions
  FOR SELECT TO anon USING (EXISTS (
    SELECT 1 FROM public.survey_templates t WHERE t.id = survey_questions.template_id AND t.is_active
  ));

DROP POLICY IF EXISTS "anon read survey_template_products" ON public.survey_template_products;
CREATE POLICY "Visitors read products of active templates" ON public.survey_template_products
  FOR SELECT TO anon USING (EXISTS (
    SELECT 1 FROM public.survey_templates t WHERE t.id = survey_template_products.template_id AND t.is_active
  ));

DROP POLICY IF EXISTS "anon read survey_template_services" ON public.survey_template_services;
CREATE POLICY "Visitors read services of active templates" ON public.survey_template_services
  FOR SELECT TO anon USING (EXISTS (
    SELECT 1 FROM public.survey_templates t WHERE t.id = survey_template_services.template_id AND t.is_active
  ));

-- Services: visitors see only services recommended by an active survey template.
DROP POLICY IF EXISTS "Allow public read services" ON public.services;
CREATE POLICY "Visitors read services on active surveys" ON public.services
  FOR SELECT TO anon USING (EXISTS (
    SELECT 1 FROM public.survey_template_services sts
    JOIN public.survey_templates t ON t.id = sts.template_id
    WHERE sts.service_id = services.id AND t.is_active
  ));