-- Stop "force password change" from catching people already using the app.
--
-- staff.force_password_change has been written since 20260415113430 and read by
-- nothing, so it has never prompted anyone. The frontend now acts on it - which
-- means the flag's current value suddenly matters, and its current value is
-- wrong for everybody.
--
-- That column was added with DEFAULT true. Postgres backfills a non-volatile
-- default onto existing rows, so every staff row reads true regardless of how
-- long that person has been signing in. Switching the gate on without this
-- would have put the front desk and the admins behind a password-change screen
-- at their next sign-in, for no reason.
--
-- Anyone who has actually signed in keeps the password they already chose. The
-- flag stays set only for accounts that have never been used - which is exactly
-- the logins being issued now, and any issued from here on.

UPDATE public.staff s
   SET force_password_change = false
  FROM auth.users u
 WHERE u.id = s.auth_user_id
   AND u.last_sign_in_at IS NOT NULL
   AND s.force_password_change IS DISTINCT FROM false;

-- A staff row with no login cannot have signed in, and will be given its flag
-- by whoever creates the login. Leave it alone rather than guessing.
