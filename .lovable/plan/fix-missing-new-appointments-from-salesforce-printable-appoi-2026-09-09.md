# Fix missing new appointments from Salesforce + printable appointment views

## What's happening (verified)

The Salesforce sync only ever looks at patients that have **never** been synced before. Every one of the 15,131 linked patients is already marked as done, so the sync reports "nothing to import" — even when Salesforce has brand-new appointments for those same patients.

Checked against the live data:
- Patients linked to Salesforce: 15,131
- Patients still waiting for a first clinical sync: 0
- Appointments in the app for today: 7 (all originally from Salesforce), versus ~40 in Salesforce

So today's newer bookings are simply never looked for. Nothing is broken in the import itself — it just never asks Salesforce again for a patient it has already handled once.

## Part 1 — Bring in new and changed appointments

Add a **date-window "recent" mode** to the clinical import, alongside the existing first-time backfill:

- Instead of walking patient by patient, ask Salesforce directly for all appointments (and their linked billing and visit notes) whose date falls in a chosen window — today, last 7 days, or a custom range.
- Match each one back to the right patient by their Salesforce link; anything already imported is skipped by its Salesforce record id, so nothing duplicates.
- Appointments for a Salesforce patient that isn't in the app yet get reported in the summary so they aren't silently dropped; the existing phone-matching step still runs first to link as many as possible.
- Update the "Sync from Salesforce" panel with a second action: **Sync recent appointments** with a small window picker (Today / Last 7 days / Date range), showing imported vs already-present counts.

This makes the daily use case ("pull today's bookings") a one-click, repeatable action, while the original full backfill stays untouched for the historical load.

## Part 2 — Print any appointment view

Add a **Print** action to the Appointments list toolbar that prints exactly what is on screen — the current date filter (Today / This Week / a chosen range), doctor/status filters, search and column choices all respected.

- Prints the full filtered result set, not just the visible page.
- Clean print layout: clinic name and logo, the view name, the date range and filters applied, generated-on timestamp, then the table.
- Landscape-friendly, repeated table headers across pages, no buttons/menus/sidebars in the printout.
- Uses the browser print dialog, so "Save as PDF" works from the same button.

## Technical notes

- `supabase/functions/sf-import-clinical/index.ts`: add a `mode=recent&from=&to=` branch that runs a SOQL query over `Appointment__c` filtered on `Start_Time__c`, then pulls related `Billing__c` / `Diagnosis__c` for the returned appointment ids, and reuses the existing row-mapping and de-duplication-by-`sf_id` logic. Keeps the 90-second deadline and batching guards already in place; paginates via SOQL `nextRecordsUrl`.
- `src/lib/salesforceSyncStore.ts`: new `startRecentSync(from, to)` loop that runs linking then the recent-window clinical call, reusing the current progress/log state.
- `src/components/salesforce/SalesforceSyncButton.tsx`: window picker + second action button; existing full-sync behaviour unchanged.
- `src/pages/Appointments.tsx`: Print button that fetches all rows for the active filters (server-side, same query builder as `src/lib/appointmentsPage.ts`, no 200-row page cap) and renders a print-only container; print styles added to `src/index.css`.
