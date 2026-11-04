
CREATE TABLE public.patient_family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  related_patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  is_primary_contact boolean DEFAULT false,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(patient_id, related_patient_id)
);

ALTER TABLE public.patient_family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read patient_family_members" ON public.patient_family_members FOR SELECT TO anon USING (true);
CREATE POLICY "Allow public insert patient_family_members" ON public.patient_family_members FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow public update patient_family_members" ON public.patient_family_members FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete patient_family_members" ON public.patient_family_members FOR DELETE TO anon USING (true);
CREATE POLICY "Auth read patient_family_members" ON public.patient_family_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert patient_family_members" ON public.patient_family_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update patient_family_members" ON public.patient_family_members FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth delete patient_family_members" ON public.patient_family_members FOR DELETE TO authenticated USING (true);
