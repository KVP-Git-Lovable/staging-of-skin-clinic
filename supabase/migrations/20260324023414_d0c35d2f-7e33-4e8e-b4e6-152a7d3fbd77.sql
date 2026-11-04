
-- Survey Templates
CREATE TABLE public.survey_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  age_range_min INTEGER DEFAULT 0,
  age_range_max INTEGER DEFAULT 120,
  problem_area_id UUID REFERENCES public.problem_areas(id) ON DELETE SET NULL,
  service_id UUID REFERENCES public.services(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read survey_templates" ON public.survey_templates FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert survey_templates" ON public.survey_templates FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update survey_templates" ON public.survey_templates FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete survey_templates" ON public.survey_templates FOR DELETE TO anon USING (true);
CREATE POLICY "auth read survey_templates" ON public.survey_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey_templates" ON public.survey_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update survey_templates" ON public.survey_templates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete survey_templates" ON public.survey_templates FOR DELETE TO authenticated USING (true);

-- Survey Questions
CREATE TABLE public.survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text',
  options JSONB DEFAULT '[]'::jsonb,
  ideal_answer JSONB DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read survey_questions" ON public.survey_questions FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert survey_questions" ON public.survey_questions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update survey_questions" ON public.survey_questions FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete survey_questions" ON public.survey_questions FOR DELETE TO anon USING (true);
CREATE POLICY "auth read survey_questions" ON public.survey_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey_questions" ON public.survey_questions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update survey_questions" ON public.survey_questions FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete survey_questions" ON public.survey_questions FOR DELETE TO authenticated USING (true);

-- Survey Template Products
CREATE TABLE public.survey_template_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.pharma_products(id) ON DELETE CASCADE,
  advice_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_template_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read survey_template_products" ON public.survey_template_products FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert survey_template_products" ON public.survey_template_products FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update survey_template_products" ON public.survey_template_products FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete survey_template_products" ON public.survey_template_products FOR DELETE TO anon USING (true);
CREATE POLICY "auth read survey_template_products" ON public.survey_template_products FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey_template_products" ON public.survey_template_products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update survey_template_products" ON public.survey_template_products FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete survey_template_products" ON public.survey_template_products FOR DELETE TO authenticated USING (true);

-- Survey Template Services
CREATE TABLE public.survey_template_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  advice_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_template_services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read survey_template_services" ON public.survey_template_services FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert survey_template_services" ON public.survey_template_services FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update survey_template_services" ON public.survey_template_services FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete survey_template_services" ON public.survey_template_services FOR DELETE TO anon USING (true);
CREATE POLICY "auth read survey_template_services" ON public.survey_template_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey_template_services" ON public.survey_template_services FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update survey_template_services" ON public.survey_template_services FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete survey_template_services" ON public.survey_template_services FOR DELETE TO authenticated USING (true);

-- Survey Responses
CREATE TABLE public.survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.survey_templates(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  answers JSONB DEFAULT '{}'::jsonb,
  ai_recommendation JSONB DEFAULT '{}'::jsonb,
  ai_products JSONB DEFAULT '[]'::jsonb,
  ai_services JSONB DEFAULT '[]'::jsonb,
  dr_status TEXT NOT NULL DEFAULT 'pending_review',
  dr_notes TEXT,
  reviewed_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read survey_responses" ON public.survey_responses FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert survey_responses" ON public.survey_responses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update survey_responses" ON public.survey_responses FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete survey_responses" ON public.survey_responses FOR DELETE TO anon USING (true);
CREATE POLICY "auth read survey_responses" ON public.survey_responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert survey_responses" ON public.survey_responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update survey_responses" ON public.survey_responses FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete survey_responses" ON public.survey_responses FOR DELETE TO authenticated USING (true);

-- Add survey_template_id to appointments
ALTER TABLE public.appointments ADD COLUMN survey_template_id UUID REFERENCES public.survey_templates(id) ON DELETE SET NULL;
