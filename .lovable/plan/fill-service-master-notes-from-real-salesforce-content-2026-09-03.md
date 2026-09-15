# Fill Service Master notes from real Salesforce content

## What I found

I queried the connected Salesforce org directly:

- There are 95 Service templates. For the ones in your screenshots (Viora, Viora and revlite, Viora RESUR - FX REVLITE, Urticaria, Upper Lip Hair Reduction, Vitiligo - for excimer) every notes field on the Service record itself is empty: Special Instructions, Dietary Advice, Product Description, Prescription.
- Only a minority of Service templates carry text (examples that do: "acne grade 4", "Hair reduction", "Hand eczema", "acne PIH"). The sync is already importing those correctly — locally 41 of 107 services have Procedure Notes.
- The rich clinical text lives on the per-visit records (Diagnosis) instead: Special Instructions, Dietary Advice, Advice and Prescription are filled there, e.g. "LHR-Face - once in 6 weeks - 3 sessions f/b maintenance".
- Those visit records have a lookup back to the Service template, and it is populated on a useful share of visits (top services have 6-19 linked visits each).

So the sync isn't dropping data — the service templates in Salesforce genuinely are blank, and the content the doctors actually wrote sits on visits.

## Proposed fix

Extend the service sync so a service's notes fall back to its linked visit records when the template itself is empty.

1. Keep the current behaviour first: if the Service template has Special Instructions / Product Description / Dietary Advice / Prescription, use them.
2. When the template is empty, look at the visits linked to that service (newest first, capped per service) and take the most recent non-empty value for each of:
   - Procedure Notes <- visit Special Instructions
   - Recommendations <- visit Dietary Advice + Advice
   - Medicines / prescription text <- visit Prescription
3. Mark derived values so they're distinguishable, e.g. a trailing line "Imported from a past visit (date)", so staff know it's a suggestion drawn from history rather than an authored template.
4. Never overwrite anything already filled in the app (your choice) — derived text only lands in fields that are currently empty.
5. Report at the end of the sync: how many services got notes from the template, how many from visit history, and how many still have none because Salesforce holds nothing anywhere.

## Also worth fixing in the same pass

- Duplicate template names in Salesforce (e.g. "acne grade 4" exists twice, "Hair fall"/"hair fall") currently collapse onto one local row and the second gets counted as a salesforce_id conflict. I'll keep the record that has content rather than whichever arrives first.
- The sync reads only the first Salesforce result page. With 95 services that's fine today, but I'll follow pagination so it doesn't silently truncate later.

## Technical notes

- Edge function `sync-salesforce-services`: add a second SOQL query over Diagnosis records where the Service lookup is set, selecting Id, Service lookup, Special_Instructions__c, Advice__c, Dietary_Advice__c, Prescription__c, CreatedDate; group them by service Id in memory and pick the newest non-empty value per field. Follow `nextRecordsUrl` on both queries.
- `src/pages/Services.tsx`: unchanged merge policy (fill-empty-only); just surface the richer counts in the success toast.
- No database schema change — `services.procedure_notes` and `services.recommendations` already exist.
