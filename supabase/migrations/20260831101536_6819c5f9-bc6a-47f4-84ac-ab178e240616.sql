CREATE OR REPLACE FUNCTION public.create_patient_portal_token(_patient_id uuid, _otp_code text, _phone text, _expires_at timestamptz)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF _otp_code !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'Invalid code';
  END IF;

  INSERT INTO public.patient_portal_tokens (patient_id, otp_code, phone, expires_at)
  VALUES (_patient_id, _otp_code, _phone, COALESCE(_expires_at, now() + interval '24 hours'))
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_patient_portal_token(uuid, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_patient_portal_token(uuid, text, text, timestamptz) TO authenticated;