# Fix the patient portal's blank profile and billing

## What's wrong

The patient portal signs people in with an OTP and stores a `portal_session` in the browser, but it then reads the database with the public (anonymous) key. Earlier security hardening removed all anonymous access to patient and invoice data — confirmed in the live database: the anonymous role has no privileges and no access rules on `patients` or `invoices` (and the same is true for appointments, procedures, photos and prescriptions). Every portal read of those tables is rejected, and the portal code throws the error away, so the profile and billing sections simply render empty.

Re-opening anonymous access to patient and billing tables is not an option — that is exactly the hole the security work closed.

## The fix

Serve portal data through a trusted server function instead of direct anonymous database reads.

1. **New `portal-data` edge function**
   - Accepts the portal session token issued at OTP verification plus the requested section (profile, appointments, procedures, photos, invoices, shop address).
   - Validates the token against `patient_portal_tokens` (unexpired, matching patient) server-side before returning anything.
   - Reads with the service role, scoped strictly to that one patient's rows, and returns only the fields the portal actually shows.

2. **Harden the portal session**
   - `portal-otp-verify` returns an opaque token stored alongside the patient id in `portal_session`; the patient id alone is never enough to fetch data.

3. **Update the portal front end**
   - `src/pages/portal/Portal.tsx` and `src/components/portal/PortalShop.tsx` call `portal-data` instead of querying `patients`, `invoices`, `appointments`, `procedures`, `patient_photos` directly.
   - Every query surfaces its error: expired/invalid session sends the patient back to the login screen; other failures show a clear "couldn't load your details" message with a retry, instead of a blank panel.

4. **Invoice PDFs**
   - The PDF link is returned by `portal-data` (signed URL where the bucket is private) rather than read from the `invoices` table by the browser.

## Not changing

No loosening of database permissions, no changes to the staff-facing app, no schema changes beyond what the token check already supports.

## Verification

Sign in to the portal as a test patient and confirm profile, appointments, procedures, photos, billing and the shop address all load, an expired session redirects to login, and no "permission denied" entries appear in the database logs afterwards.
