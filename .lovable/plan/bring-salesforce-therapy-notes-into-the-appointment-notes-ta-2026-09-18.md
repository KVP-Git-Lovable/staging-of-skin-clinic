# Bring Salesforce therapy notes into the appointment Notes tab

15,226 therapy notes live in Salesforce (15,217 with text, 99.2% linked to an appointment). They will appear as notes on the matching visit, in the Notes tab of the appointment screen — the same place staff already add notes today.

## What you will see

- Open any past visit, go to Notes: the Salesforce therapy note appears as a note card.
- Title reads "Therapy note - Dr. Vindhya Pai" (or the doctor on the record), with "Assisted by ..." kept with the text when present.
- Notes keep their original Salesforce date, so the ordering and history stay correct.
- Notes staff already wrote in the app are untouched, and re-running the import never creates duplicates.

## How it works

- Matching is by Salesforce appointment: 37,231 of 37,277 visits already carry their Salesforce id, so notes land on the right visit.
- A note whose appointment is missing (about 0.8%) is attached instead to the patient's visit on the same date if one exists; otherwise it is skipped and reported in the run summary rather than silently dropped.
- Import runs in batches with a time budget, like the existing photo and clinical imports, and can be run repeatedly until it reports nothing left.

## Technical detail

1. Migration: add `sf_id text` to `appointment_sticky_notes` with a unique index (partial, where not null) so re-runs are idempotent.
2. New edge function `sf-import-therapy-notes`:
   - Pages `Therapy_Note__c` (Id, Name, Treatment__c, Date__c, CreatedDate, Doctor__r.Name, Assisted_By__c, Appointment__c, Patient__c) via the Salesforce gateway, ordered by CreatedDate, using SOQL `OFFSET`-free keyset paging on CreatedDate.
   - Maps `Appointment__c` -> `appointments.sf_id`; fallback to patient + `Date__c` match; inserts into `appointment_sticky_notes` with `title` = `Therapy note - <doctor>`, `content` = treatment text plus an `Assisted by:` line, `created_at` = Salesforce CreatedDate, `sf_id` = Therapy Note Id.
   - Skips ids already present (`sf_id` set), honours a 90s deadline, returns counts: imported / skipped / unmatched / errors.
   - Reuses the existing gateway helper shape from `sf-import-clinical` (`LOVABLE_API_KEY` + `SALESFORCE_API_KEY`, service-role client).
3. Deploy the function and run it to completion; report final totals.
4. No UI changes needed — `StickyNotes` on the appointment already reads `appointment_sticky_notes`.
