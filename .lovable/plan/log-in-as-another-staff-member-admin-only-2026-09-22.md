# Log in as another staff member (admin only)

Add a controlled "Log in as this user" action on the Staff Users screen, restricted to a short
list of people you name, with a visible banner while it is active and a permanent record of every use.

## What you get

- A **Log in as** button on each staff row in Staff Users, shown only to people on the allowed list.
- Clicking it switches the whole app to that person's account — same menus, same permissions, same data
  they would see. No password needed.
- A **banner across the top of every screen**: "You are acting as <name>. Everything you do is recorded
  as that person." with a **Return to my account** button.
- Pressing Return puts you back in your own account, exactly where you were, without signing in again.
- A record of every switch (who, as whom, when, and when it ended), readable only by admins.

## Who is allowed

The list of allowed people is stored as a backend secret (`IMPERSONATION_ALLOWED_EMAILS`), not in the
code, and is checked on the server every single time. If the secret is missing or empty, the feature is
off for everyone — the button never appears and the server refuses the request. You set the list; changing
it needs no code change.

## Safety

- Nothing about normal sign-in changes: existing logins, password reset, forced password change, roles and
  permissions all keep working untouched.
- The server re-checks: caller is signed in, caller is an admin, caller's email is on the secret list, and
  the target is an active staff account. A browser-side check alone is never trusted.
- Acting as another person gives exactly their permissions — not more.

## Technical notes

1. **Database** — new migration adding `public.impersonation_log`
   (`id`, `actor_user_id`, `actor_email`, `target_user_id`, `target_email`, `started_at`, `ended_at`),
   with GRANTs (`authenticated`, `service_role`), RLS on, and a select policy limited to admins
   (role name `admin` via the existing `user_roles_config` join used by `has_full_data_scope`-style checks).
   Inserts happen from the edge function under the service role only.

2. **Edge function** — new `supabase/functions/impersonate/index.ts`:
   - `action: "start"` — validates the caller's JWT, loads their staff row + role, requires `admin`,
     requires their email to be in `IMPERSONATION_ALLOWED_EMAILS` (comma-separated secret; empty/missing =
     deny all). Then uses the service role `auth.admin.generateLink({ type: "magiclink" })` for the target
     user and returns the `token_hash` (never a password, never the service key). Writes the audit row.
   - `action: "end"` — stamps `ended_at` on the open row.
   - `action: "can_impersonate"` — cheap yes/no so the UI knows whether to show the button.
   - CORS headers on every response; input validated.

3. **Client session swap** — `src/lib/impersonation.ts`:
   - Saves the admin's current session (`access_token`/`refresh_token`) plus actor/target names in
     `sessionStorage` under one key.
   - Calls `supabase.auth.verifyOtp({ type: "magiclink", token_hash })` to adopt the target session.
   - Return: `supabase.auth.setSession(savedTokens)`, clear the key, call `action: "end"`, reload.
   - `src/integrations/supabase/client.ts` and `previewAuthStorage.ts` are **not** touched.

4. **Banner** — `src/components/auth/ImpersonationBanner.tsx`, rendered at the top of `AppLayout`
   (above the header, so it shows on every in-app screen), driven by the sessionStorage marker.
   Destructive-toned band using existing tokens, with the Return button.

5. **UI** — add the row action in `src/pages/UserManagement.tsx`, gated on the server's
   `can_impersonate` answer, with a confirm dialog naming the target. No other logic on that page changes.

6. **Secret** — you will be prompted to supply `IMPERSONATION_ALLOWED_EMAILS` during the build.

7. **Audit view** — a read-only "Login-as history" panel on the Staff Users screen (admins only),
   listing actor, target and time.
