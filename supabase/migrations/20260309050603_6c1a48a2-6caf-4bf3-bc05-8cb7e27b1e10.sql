-- Patient portal OTP tokens
CREATE TABLE public.patient_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  otp_code TEXT NOT NULL,
  session_token UUID DEFAULT gen_random_uuid(),
  phone TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.patient_portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to portal tokens" ON public.patient_portal_tokens FOR ALL USING (true) WITH CHECK (true);

-- Patient pharma requests
CREATE TABLE public.patient_pharma_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.pharma_products(id),
  product_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  notes TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.patient_pharma_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to pharma requests" ON public.patient_pharma_requests FOR ALL USING (true) WITH CHECK (true);

-- Patient appointment requests (add a source field to appointments)
ALTER TABLE public.appointments ADD COLUMN source TEXT DEFAULT 'clinic';