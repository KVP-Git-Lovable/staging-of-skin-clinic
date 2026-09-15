# Keep today's appointment list in step with Salesforce (49 vs 42)

## What the numbers actually are (checked against both systems)

Today in the app: 49 appointments — 48 Confirmed, 1 Completed. None are Cancelled.
Today in Salesforce: 42 appointments — all of them Confirmed. There are no cancelled appointments today, in either system.

Comparing the 48 Salesforce-sourced rows in the app against Salesforce record by record:

- 41 match Salesforce exactly (still today, still Confirmed)
- 3 were **moved to a later date** in Salesforce (11 Sep, 15 Sep, 15 Sep) but still sit under today here
- 4 no longer exist in Salesforce at all (deleted there after we imported them)
- 1 was created directly in the app, not from Salesforce
- 1 Salesforce appointment for today has still not come across

41 + 3 + 4 + 1 = 49. So the gap is not cancellations — it is that the sync only ever **adds** appointments. Once a record is imported, a later change in Salesforce (new time, new date, new status, or deletion) is never picked up again.

## What to change

Make the "Sync recent appointments" run a real refresh of the chosen window instead of an add-only pass:

1. **Update changed appointments.** For every Salesforce appointment in the window that already exists here, refresh date/time, status, service, doctor and visit type from Salesforce, instead of skipping it. Appointment status in the app then always mirrors Salesforce — including Cancelled, whenever one does appear.
2. **Handle records moved out of the window.** An appointment rescheduled to another date simply gets its new date written, so it disappears from today and shows up on the right day.
3. **Handle records deleted in Salesforce.** Any appointment here that came from Salesforce, falls inside the synced window, and no longer exists in Salesforce gets marked Cancelled with a note that it was removed in Salesforce — rather than being hard-deleted, so nothing is silently lost. Appointments created in the app are never touched.
4. **Never overwrite local work.** Fields the app owns and Salesforce doesn't have (next visit, owner, linked invoice/procedure references, notes typed here) are left alone.
5. **Report it clearly.** The sync summary gains "updated" and "cancelled (removed in Salesforce)" counts next to the existing imported/skipped numbers, so a run of today's window reads: imported X, updated Y, cancelled Z.

After this change, running "Today" will bring the app's count to 42, matching Salesforce.

## Technical notes

- `supabase/functions/sf-import-clinical/index.ts`:
  - In `syncPatient`, stop filtering appointments to only unseen `sf_id`s. Split into inserts (unseen) and updates (seen): build the same mapped row and `update` it by `sf_id`, restricting the update to Salesforce-owned columns (`start_time`, `end_time`, `status`, `service`, `staff_id`, `visit_type`). Keep the existing future-dated guard that prevents stamping Completed/No Show on an appointment that hasn't started.
  - In recent mode, after processing the targets, reconcile deletions: select app appointments with `sf_id IS NOT NULL` whose `start_time` falls inside the window, diff their `sf_id`s against the set of Salesforce ids returned for that window, and set the missing ones to `status = 'Cancelled'` with a `notes` marker. Batch the id comparison in chunks of 200.
  - Return `updated` and `cancelled_missing` counters in the response payload alongside `imported`/`skipped`.
  - Note: rows updated out of the window (rescheduled) must be reconciled *before* the delete pass keys off the window, so a moved appointment isn't mistaken for a deleted one — run the per-patient import first, then re-read the window.
- `src/lib/salesforceSyncStore.ts`: accumulate and surface the two new counters in the recent-sync progress/log state.
- `src/components/salesforce/SalesforceSyncButton.tsx`: show "imported / updated / cancelled" in the recent-sync result line.
- Redeploy `sf-import-clinical` after the change and run the Today window to verify the count lands on 42.
