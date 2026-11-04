# Fix weak-password account creation failure

## Changes
- Keep the Create User window open when account creation is rejected.
- Show the password rejection directly inside the window in clear language.
- Treat expected validation responses as form feedback instead of an unhandled runtime error.
- Align the visible password guidance with the existing eight-character complexity checks.
- Preserve the backend's breached-password protection rather than weakening it.

## Verification
- Check TypeScript and the preview build.
- Exercise the weak-password path and confirm the page remains usable with visible guidance.
