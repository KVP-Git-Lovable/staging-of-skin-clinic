# Stop slow screens from timing out

Three of the four issues are already fixed. The remaining one — requests being cancelled because they take too long — is broader and needs its own pass.

## What is happening

Some screens ask the database for every matching record at once, with no cap:

- The home dashboard pulls all appointments, all invoices and all new patients for the selected period.
- The report preview pulls the whole table when a report uses custom filter logic, then filters in the browser.

On a database with tens of thousands of records these requests get cancelled, so the user sees a spinner that never ends or an empty table.

The Salesforce import side of this finding is already reduced: each import call now handles at most 20 patients (the app was still asking for 60).

## Proposed work

1. Dashboard: fetch counts as counts (server-side) instead of downloading rows, and cap the row lists that feed the panels and charts.
2. Report preview: push the report's filters into the database query wherever possible, and cap the preview to a fixed number of rows with a clear "showing first N" note; full data stays available through export.
3. Add database indexes for the columns these screens filter and sort on (appointment start time, invoice creation date, patient creation date), then confirm with query plans that the indexes are used.
4. Show a clear "this took too long, retry" message instead of a silent empty panel when a request is cancelled.

## Technical notes

- Indexes via migration: `appointments(start_time)`, `invoices(created_at)`, `invoices(status, created_at)`, `patients(created_at)`.
- `src/pages/Index.tsx`: replace `select("*")` row pulls with aggregate/`head: true` counts plus bounded `.limit()` lists.
- `src/components/reports/ReportPreview.tsx`: translate supported filter conditions into PostgREST filters; keep client-side evaluation only for conditions that cannot be expressed server-side, over a bounded row set.
- Verify with `EXPLAIN (ANALYZE, BUFFERS)` before and after the index migration.
