
-- Problem areas master table
CREATE TABLE public.problem_areas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.problem_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon read problem_areas" ON public.problem_areas FOR SELECT TO anon USING (true);
CREATE POLICY "anon insert problem_areas" ON public.problem_areas FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon update problem_areas" ON public.problem_areas FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon delete problem_areas" ON public.problem_areas FOR DELETE TO anon USING (true);
CREATE POLICY "auth read problem_areas" ON public.problem_areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert problem_areas" ON public.problem_areas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update problem_areas" ON public.problem_areas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete problem_areas" ON public.problem_areas FOR DELETE TO authenticated USING (true);

-- Add problem_area_ids to appointments as a text array
ALTER TABLE public.appointments ADD COLUMN problem_area_ids UUID[] DEFAULT '{}';
