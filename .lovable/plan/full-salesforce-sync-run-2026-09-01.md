# Full Salesforce Sync Run

No code changes. Deploy the existing functions as-is, then drive them to completion.

## Step 1 — Redeploy (unchanged code)

Deploy these four edge functions from the current repo:

- `sf-import-clinical`
- `sf-import-pictures`
- `sf-import-attachments`
- `sf-match-phones`

Verify with `sf-import-clinical?only=Paulina` and confirm the JSON contains a numeric `processed` field. If it's missing, stop and investigate the deploy before running anything else.

## Step 2 — Run the sync to completion

a) **Link patients** — loop `sf-match-phones?apply=true&apply_offset=<n>&apply_limit=2000`, following `next_apply_offset` until it is null.

b) **Clinical** (appointments, procedures, invoices) — loop `sf-import-clinical?limit=25` until `processed` is 0.

c) **Photos** — loop `sf-import-pictures?limit=12` until `processed` is 0.

d) **Documents** — loop `sf-import-attachments?limit=12` until `processed` is 0.

Each stage runs from a background script with per-call logging so progress survives long runtimes. Expected duration: a couple of hours across many small batches.

## Error handling

- A failing batch is retried once, then skipped and recorded (patient name/id where the response gives one); the loop continues.
- Repeated timeouts on a stage drop that stage's batch size (clinical 25 → 15, pictures/attachments 12 → 6) rather than aborting.
- Batches are idempotent — already-imported records are skipped via the `sf_*_synced_at` markers and `sf_id` guards, so retries never duplicate data.

## Expected coverage

Roughly 15,000 of ~17,000 patients link by phone. Ambiguous or non-matching phone numbers are deliberately left unlinked to avoid wrong matches.

## Final report

Patients linked; appointments/procedures/invoices/photos/attachments imported; totals skipped as already-imported; and every error encountered with patient identifiers.
