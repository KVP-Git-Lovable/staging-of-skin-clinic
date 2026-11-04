CREATE TABLE public.knowledge_article_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_article_categories TO authenticated;
GRANT ALL ON public.knowledge_article_categories TO service_role;
ALTER TABLE public.knowledge_article_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read knowledge categories" ON public.knowledge_article_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage knowledge categories" ON public.knowledge_article_categories FOR ALL TO authenticated USING (public.is_admin_user()) WITH CHECK (public.is_admin_user());
CREATE TRIGGER trg_kac_updated BEFORE UPDATE ON public.knowledge_article_categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.knowledge_article_categories (name, description, sort_order)
SELECT * FROM (VALUES
 ('Clinical Protocols & Technique Guidelines','Step-by-step procedure steps, device parameters (fluence, spot size, pulse duration, passes) and peel layering techniques.',1),
 ('Cosmetic Injectables, Botox & Fillers Guidelines','Facial anatomy zones, reconstitution ratios, unit calculations, injection depths, vascular danger zones and touch-up intervals.',2),
 ('Skin Prep & Priming Formulas','Pre-peel and pre-laser conditioning, retinoid/acid pause windows, tyrosinase-inhibitor priming for Fitzpatrick III–V, barrier prep.',3),
 ('Dosage, Dilution & Device Parameter Charts','Topical anaesthetic timing, dilution ratios and energy settings by skin phototype.',4),
 ('Contraindications, Age & Safety Alerts','Absolute/relative contraindications (isotretinoin, keloids, infection, pregnancy/lactation, photosensitising drugs) and age limits.',5),
 ('Post-Care & Home Recovery Protocols','Immediate aftercare, home skincare routine, downtime, peeling timelines and sun protection.',6),
 ('Complication Management & Emergency Protocols','Vascular occlusion (hyaluronidase pathway), burns, infection response and PIH mitigation.',7),
 ('Patient Consultation & Expectation Scripts','Consent talking points, realistic outcomes, session counts and downtime communication.',8)
) AS v(name, description, sort_order);