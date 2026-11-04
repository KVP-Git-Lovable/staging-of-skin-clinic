# Stop the big lists from timing out

Two of the three monitoring items are already settled: staff sign-in works again, and the prescription document now returns a clear "record not found" message instead of an error. The third one — lists that spin forever — is real and still happening, but it touches several busy screens, so here is the plan before changing anything.

## What is happening

The database cancels a request when it takes too long. With roughly 56,000 visits, 61,000 bills and 23,000 patients, a few screens ask for more than the database can return in time:

- Patient search matches text anywhere in a name or phone, which forces a full scan of every patient, and some of those searches have no page limit at all.
- The appointments list asks for an exact total count of matching rows on every page turn, on top of pulling every column and joined patient and doctor details.
- The report preview pulls a whole table when a report uses custom filter logic.
- The home dashboard counts records for the chosen period.

When the request is cancelled nothing is shown — no message, just an empty list or an endless spinner.

## Proposed work

1. Patient search: give every search path a page limit, and add a text-search index so name and phone lookups stop scanning the whole table.
2. Appointments list: stop asking for an exact total on every page; use an estimated total (exact only for small result sets) and select only the columns the table shows.
3. Report preview: cap the preview to a fixed number of rows with a visible "showing first N" note; the full set stays available through export.
4. Dashboard: ask for counts as counts instead of downloading rows.
5. Whenever a request is cancelled for taking too long, show a short "this took too long — retry" message with a retry button instead of a blank panel.

## Technical notes

- New indexes by migration: `pg_trgm` GIN indexes on `patients.first_name`, `patients.last_name`, `patients.phone` to support leading-wildcard ILIKE; verify with `EXPLAIN (ANALYZE, BUFFERS)`.
- `src/pages/Patients.tsx`: add `.range()` to every fallback search branch; switch `count: "exact"` to `"estimated"` (or `"planned"`) for unfiltered pages.
- `src/lib/appointmentsPage.ts`: replace `select("*")` with an explicit column list; use estimated counts; keep the existing phone-id prefetch but bound it.
- `src/components/reports/ReportPreview.tsx` and `src/lib/reportsCatalog.ts:172`: bounded `.range()` preview, push supported filters into PostgREST.
- `src/pages/Index.tsx`: `head: true` count queries instead of row pulls.
- Detect cancellations by PostgREST code `57014` and surface a retry state in the affected panels.
