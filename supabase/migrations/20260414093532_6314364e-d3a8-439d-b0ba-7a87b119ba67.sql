
CREATE TABLE public.portal_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  out_of_stock_behavior text NOT NULL DEFAULT 'show_out_of_stock',
  hide_expiring_products boolean NOT NULL DEFAULT false,
  expiring_threshold_days integer NOT NULL DEFAULT 90,
  shop_enabled boolean NOT NULL DEFAULT true,
  low_stock_threshold integer NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read portal_settings" ON public.portal_settings FOR SELECT USING (true);
CREATE POLICY "Allow public insert portal_settings" ON public.portal_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update portal_settings" ON public.portal_settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Auth read portal_settings" ON public.portal_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert portal_settings" ON public.portal_settings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update portal_settings" ON public.portal_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Seed default row
INSERT INTO public.portal_settings (out_of_stock_behavior, hide_expiring_products, shop_enabled) VALUES ('show_out_of_stock', false, true);

-- Auto-update timestamp
CREATE TRIGGER update_portal_settings_updated_at
  BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
