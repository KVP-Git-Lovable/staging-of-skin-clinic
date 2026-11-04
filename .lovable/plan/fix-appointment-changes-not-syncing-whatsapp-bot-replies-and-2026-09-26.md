# Fix appointment changes not syncing, WhatsApp bot replies, and "No bill" on Faiz Saneel

The root causes below have not been confirmed yet. Step 1 for each item is to check the real records in the app against Salesforce. Each fix is then based on what those records show.

## 1, 3 and 4. Rescheduled appointments showing the old date (Dr Punya's Monday list, Prajwal Shetty, Bharathi)

**Investigate**

- Pull Dr Punya's Monday appointments, Prajwal Shetty's and Bharathi's from Salesforce: the current start time and when each was last changed.(Please note that appointment edits were made in this app, not in salesforce)
- Compare them with the app's copies: start time, last-updated time, and whether each was imported or made by hand.
- Check the sync's recent runs: whether the frequent "recent changes" pass ran yesterday and today, and whether it only picks up new appointments or also reschedules of existing ones.
- Check for duplicates: an app-made appointment next to the Salesforce one, like Sumana's case this morning.
- For Bharathi, find what put her in today's list after the morning print: the sync, a staff edit, or a duplicate.

**Likely causes to confirm or rule out**

- The sync may only look for changes by created date, not last-modified date, so time changes on existing appointments are skipped.
- The sync may skip appointments already in the app, so a new time never gets written.
- Deleted-then-rescheduled records may still be blocked (fixed earlier today for date changes only).
- Two copies of the same visit may exist, with the stale one still showing.

**Fix**

- Make the sync pick up every Salesforce appointment changed since the last run, using last-modified time, and update the time, status and doctor on the existing record.
- Re-run it for the last 7 days so yesterday's reschedules come in now.
- Check that all of Dr Punya's Monday list, Prajwal and Bharathi match Salesforce, and re-count this week's appointments on both sides.

## 2. WhatsApp: stop bot conversations

- Every message a patient sends, not just the two button presses, gets the same fixed reply:
"To modify or cancel your booking, please call us on +91 96201 23030 / +91 63607 53030.
The Skin Clinic, Mangalore"
- The AI assistant is switched off in the WhatsApp chat. Messages are still saved to the conversation history.
- Appointment confirmations and other messages sent from the app keep working as they do now.

## 5. Faiz Saneel shows "No bill"

**Investigate**

- Find Faiz Saneel's bill and today's appointment, and check whether the bill is linked to that appointment, to another one, or to none.

**Fix**

- If the bill isn't linked, link it to the right appointment.
- If bills made in the app are saved without the appointment they belong to, fix bill creation so the link is always saved. Then re-link today's unlinked bills to their appointments (same patient, same day).

## Stopping this from happening again

- After each sync, compare the day's appointment count and times with Salesforce and log any differences.
- Report the root cause of each item back to you once confirmed.

## Technical details

- `supabase/functions/sf-import-clinical/index.ts`: recent mode uses `LastModifiedDate > cursor`. The update path for existing `sf_id` rows writes `start_time`, `end_time`, `status`, `staff_id`, with the tombstone check kept. Backfill runs with `mode=recent` over 7 days.
- `supabase/functions/whatsapp-webhook/index.ts`: short-circuit before the AI call to always send the fixed text through the existing Twilio send and log paths. Redeploy.
- Billing save: make sure `appointment_id` is set on insert. Data fix through run_sql. The list's invoice lookup is already by `appointment_id`.