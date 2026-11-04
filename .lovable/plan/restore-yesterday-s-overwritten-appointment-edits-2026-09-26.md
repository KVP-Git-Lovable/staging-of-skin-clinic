# Restore yesterday’s overwritten appointment edits

## Confirmed evidence

- Appointment field history cannot recover yesterday’s changes because appointment date/time tracking was enabled only today, 26 September.
- Bharathi’s WhatsApp conversation confirms her booking was moved to **Saturday, 3 October 2026 at 11:45 AM**.
- The supplied morning printout records Prajwal Shetty for **Saturday, 26 September 2026 at 1:15 PM**; the later Monday time was the overwritten value.
- Salesforce appointment field history is not enabled for this object, so it cannot supply the missing app-side edit history.

## Restoration

1. Take a safety snapshot of every appointment that will be changed, including its current date, time, doctor, status and Salesforce ID.
2. Restore Bharathi’s affected appointment to **3 October 2026 at 11:45 AM**, preserving its duration, doctor and all other fields.
3. Restore Prajwal Shetty’s affected appointment to **26 September 2026 at 1:15 PM**, preserving its duration, doctor and all other fields.
4. Search yesterday’s WhatsApp conversations, Trash records, supplied screenshots and any surviving app activity for every other reschedule made yesterday, especially Dr Punya’s Monday list.
5. Restore each additional appointment only when its exact destination date and time are evidenced. Do not infer or guess missing times.
6. Mark every restored appointment as app-edited so the Salesforce sync cannot overwrite it again unless Salesforce has a genuinely newer change.

## Verification

- Re-read every restored appointment and produce a patient-by-patient before/after list.
- Confirm Bharathi no longer appears on 26 September and appears on 3 October at 11:45 AM.
- Confirm Prajwal appears on 26 September at 1:15 PM and not on Monday.
- Run a read-only comparison after restoration to ensure no unrelated appointments, patients, bills or prescriptions changed.
- Report any Dr Punya appointment whose exact new slot cannot be recovered, naming the patient and all evidence checked rather than assigning an uncertain slot.

## Prevention

- Keep appointment date, time, status and doctor history enabled from now on, so future overwritten edits can be restored exactly.
- Preserve the existing rule that app edits win over older Salesforce values.
