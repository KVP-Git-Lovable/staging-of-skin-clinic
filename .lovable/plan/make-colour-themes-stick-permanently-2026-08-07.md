# Make colour themes stick permanently

## What's happening

The theme feature is fully built (picker in My Profile, in User Management > Appearance, and the palette icon in the header), but the saved choice keeps getting overwritten. Two confirmed causes:

1. **The database always answers "amber".** The `theme_preference` field on staff records is required and defaults to `amber`. Right now 19 of 20 staff rows still hold `amber` and only 1 holds a different theme — so whenever your pick isn't written successfully, the next page load reads `amber` back and repaints everything.
2. **The save is fire-and-forget.** The code that writes your theme choice ignores any failure — no error, no toast. It reports "Theme changed" even when nothing was stored. There is also a reload effect that re-reads the database whenever the signed-in profile object refreshes, which can revert your pick mid-session without a refresh (matches "it disappears after some time").

## Why the Palette and Collapse icons disappeared

The icons have **not** been removed or overwritten in the current code:

- `ThemeSelector` is still rendered next to the notification bell in the authenticated app header.
- `SidebarTrigger` is still rendered next to the clinic logo, and the sidebar still uses icon-collapse mode.
- Recent source history confirms these placements were added on 7 August and remain present.

There are two concrete visibility cases:

1. **They do not appear on `/login`.** The login page is intentionally outside `AppLayout`, so it has neither the authenticated header nor sidebar. The current preview is on `/login`; their absence there is expected. They must appear after a staff user signs in.
2. **A stale installed/published app can show an older UI after sign-in.** This project is a PWA and caches its JavaScript/CSS. Preview already unregisters and clears that cache, but the published/custom-domain version uses an auto-updating service worker and can temporarily retain a previous bundle. This explains how both independently placed icons can disappear together even though both remain in source.

The implementation will verify the authenticated layout directly after sign-in and harden update behavior so a newly deployed shell cannot remain hidden behind an old cached bundle.

## The fix

- **Verify and confirm every save.** Write the theme to the staff record, check the response, and confirm a row was actually updated. Only show success when the write is confirmed; otherwise show a clear warning that the theme is applied locally only.
- **Stop the silent revert.** The reload effect runs once per signed-in staff member (keyed on staff id, not the whole profile object) and never overwrites a theme the user picked during the current session.
- **Treat a fresh pick as authoritative.** The locally stored choice wins over the database default until the database confirms a stored value, so a slow or failed write never snaps the UI back to amber.
- **No flash on load.** Apply the last known theme immediately at app startup, before the sign-in check finishes, so the correct palette paints on first render of every page (including login).
- **Persist across devices.** Once the write is confirmed, signing in anywhere picks up the same theme from the profile.
- **Keep both controls permanent.** Retain the Palette button beside the bell and the Collapse button beside the logo, with accessible labels/tooltips and stable dimensions on desktop and mobile.
- **Verify the real authenticated routes.** Test after sign-in—not on `/login`—at desktop and mobile widths, including expanded and collapsed sidebar states.
- **Prevent stale-shell confusion.** Review the PWA update lifecycle and add a safe update/reload path when a new app version is ready, rather than allowing the installed app to continue displaying an older header/sidebar indefinitely.

No changes to the picker UI, palette list, or where the picker lives — those stay as they are.

## Technical notes

- `src/hooks/useTheme.tsx`: rework `setTheme` to await the update with `.select("id")`, surface errors via toast, and guard the load effect with a ref of the staff id plus a "changed this session" flag.
- Add an eager `applyTheme(localStorage value)` at provider init so the palette is set before the auth round-trip resolves.
- `src/components/layout/AppLayout.tsx` and `AppSidebar.tsx`: preserve both icon controls and verify responsive visibility; the login page remains intentionally free of authenticated app controls.
- PWA registration/update flow: ensure a deployed update activates promptly and reloads once safely when the replacement bundle takes control.
- No database migration is required: the existing theme column and allowed theme constraint are present. The fix is reliable client-side saving and synchronization.