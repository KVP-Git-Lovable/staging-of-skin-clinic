-- A signed-in account that is not active clinic staff must not reach clinic data.
--
-- Most clinic tables were opened to the whole "authenticated" role (USING true), and
-- public sign-up was open with instant confirmation, so anyone could create an account
-- and read or change every patient record. Sign-up is now closed; this closes the data
-- side too, without touching any existing policy: a RESTRICTIVE policy is ANDed with
-- the permissive ones, so staff keep exactly the access they had and everyone else
-- signed in gets nothing. anon policies (shop, public catalogue) and the service role
-- (edge functions) are unaffected.

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_user_id = auth.uid()
      AND COALESCE(s.is_active, true)
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_staff() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff() TO authenticated, service_role;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND c.relrowsecurity
      AND c.relname <> 'staff'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS signed_in_must_be_staff ON public.%I', t.relname);
    EXECUTE format(
      'CREATE POLICY signed_in_must_be_staff ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
         USING ((SELECT public.is_active_staff()))
         WITH CHECK ((SELECT public.is_active_staff()))',
      t.relname
    );
  END LOOP;
END $$;

-- The staff table itself: a deactivated member must still be able to read their own
-- row, which is how the app knows to show "This account has been deactivated".
DROP POLICY IF EXISTS signed_in_must_be_staff ON public.staff;
CREATE POLICY signed_in_must_be_staff ON public.staff AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.is_active_staff()) OR auth_user_id = auth.uid())
  WITH CHECK ((SELECT public.is_active_staff()));
