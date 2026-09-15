# Seven fixes: procedures, appointments, HSN, invoices

## 1. Procedure — Assisted By as multi-select
Today a procedure can record only one assistant. Change the picker to allow selecting several staff members, shown as removable chips.
- Add `assisted_by_ids` (list of staff) to procedures; keep the existing single `assisted_by` field in sync with the first pick so nothing that reads it today breaks.
- Procedure form and procedure detail view both show all selected assistants.

## 2. Appointments — endless scroll into a blank page
The list only mounts rows near the viewport, and its measured offset is recalculated on every page reflow, which lets the measurement drift and leaves empty space below the last row.
- Measure the table offset from the table element itself, skip updates when the value hasn't changed, and re-measure after the row set changes.
- Clamp the virtual list height to the number of rows actually on the page so the page can never scroll past the last row.

## 3. Appointment edit — 12-hour time
Editing an appointment currently uses the browser's raw date-and-time box. Switch to a date picker plus the same AM/PM time control used when booking, for both the inline row edit and the full appointment page. Stored values stay unchanged.

## 4. HSN — pick from a list instead of typing
Replace free-text HSN entry with a searchable dropdown of active HSN codes from Tax Master, in:
- Billing invoice service lines
- Pharmacy product master and stock entry

Existing saved values that aren't in the list are still shown and preserved.

## 5. Appointments — delete with confirmation
Add a Delete action on the appointment row menu and on the appointment page. It uses the standard confirmation dialog and moves the appointment to Trash (restorable), matching how deletes work everywhere else in the app.

## 6. Medical Information — new fields, moved first
- Add Symptoms, Diagnosis and Lab Tests to the Medical Information section (Symptoms and Diagnosis already exist on procedures; Lab Tests is new).
- These are included in the AI "Elaborate" helper and the mic dictation like the other medical fields.
- Move the Medical Information tab ahead of the Procedure tab so it opens first.

## 7. Invoice — send on WhatsApp only when asked
Creating an invoice will no longer message the patient automatically.
- Create Invoice saves the invoice and generates the PDF only.
- The invoice view gains a "Send via WhatsApp" button, with a confirmation and a sent/failed status, so the front desk can review and correct first.
- Recurring plan and installment sends follow the same manual-button rule.

## Technical notes
- Migration: `ALTER TABLE public.procedures ADD COLUMN assisted_by_ids uuid[] DEFAULT '{}'`, `ADD COLUMN lab_tests text`. No data loss; existing rows keep their values.
- `ProcedureFormDialog.tsx`: assistant state becomes `string[]`; save writes both `assisted_by_ids` and `assisted_by` (first entry). `MEDICAL_FIELDS` gains symptoms/diagnosis/lab_tests (procedure-scoped, not synced to the patient record, unlike history/allergies). Tab order: medical, procedure, surveys, notes.
- `Appointments.tsx`: fix `useWindowVirtualizer` `scrollMargin` measurement (observe the table element, not `document.body`, and bail on unchanged values); add row-menu delete via `move_to_trash` + `DeleteConfirmDialog`; swap `datetime-local` inline edit to date input + `TimePicker12h`.
- `AppointmentDetailSheet.tsx`: same 12-hour control and a Delete action.
- HSN: reuse the `hsn-tax-active` query with `SearchableSelect`; touched files `Billing.tsx` (service line HSN), `Pharma.tsx` (product + stock forms).
- `Billing.tsx`: remove `void dispatchInvoiceWhatsApp(result)` from the create path (keep PDF generation); expose it behind a button in the invoice detail dialog with pending/sent state.
