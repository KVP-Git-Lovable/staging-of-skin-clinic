CREATE POLICY "No client access to Bolna booking logs"
ON public.bolna_booking_logs
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No client access to patient portal OTPs"
ON public.patient_portal_otps
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY "No client access to patient portal tokens"
ON public.patient_portal_tokens
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);