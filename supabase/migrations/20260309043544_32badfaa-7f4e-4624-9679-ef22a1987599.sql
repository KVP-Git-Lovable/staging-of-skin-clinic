
-- Patient photos table for before/after
CREATE TABLE public.patient_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id uuid REFERENCES public.patients(id) ON DELETE CASCADE NOT NULL,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  procedure_id uuid REFERENCES public.procedures(id) ON DELETE SET NULL,
  photo_type text NOT NULL DEFAULT 'before',
  photo_url text NOT NULL,
  notes text,
  taken_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view patient_photos" ON public.patient_photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create patient_photos" ON public.patient_photos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update patient_photos" ON public.patient_photos FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete patient_photos" ON public.patient_photos FOR DELETE TO authenticated USING (true);

-- Storage bucket for patient photos
INSERT INTO storage.buckets (id, name, public) VALUES ('patient-photos', 'patient-photos', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload patient photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'patient-photos');
CREATE POLICY "Anyone can view patient photos" ON storage.objects FOR SELECT USING (bucket_id = 'patient-photos');
CREATE POLICY "Authenticated users can delete patient photos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'patient-photos');
