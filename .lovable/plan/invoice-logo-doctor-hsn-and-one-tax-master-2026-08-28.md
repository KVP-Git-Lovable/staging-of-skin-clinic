# Invoice logo, doctor HSN, and one Tax Master

## 1. Fix logo overlapping the patient details

In the invoice PDF the logo is drawn 100pt tall but the header text starts only 90pt below the top, so the first rows (Patient Name / Patient ID) print on top of the logo.

Fix: measure the embedded logo, cap it at a sensible height (~60pt), and start the header block below the logo's actual bottom edge plus a gap, instead of the fixed offset. When there is no logo, fall back to the clinic name and a smaller gap so the layout stays tight.

## 2. HSN on the doctor, not hardcoded

Today the auto-added "Consultation - Dr. X" line item in Billing always uses HSN `9993`, which is now inactive in Tax Master.

- Add a **Consultation HSN** field to the staff record, shown in the Add/Edit Staff dialog right under Consultation Fee, as a dropdown listing active HSN codes from Tax Master (e.g. 999319 – 0%, 999722 – 5%).
- When a doctor is selected on an invoice, the consultation line takes that doctor's HSN and the matching GST split from Tax Master. If the doctor has no HSN set, the line is created with a blank HSN (no tax) as it does for other untaxed items.
- Existing doctors keep working; the field is optional and can be filled per doctor.

## 3. Consolidate the two Tax Masters

There are two separate tax screens:
- **Master Data > Tax Master** — HSN codes with IGST/CGST/SGST (used by invoices and the PDF).
- **Settings > Tax Master** — named tax rates linked to specific products/services (used by pharmacy pricing).

Consolidation: make **Master Data > Tax Master** the single place, with two tabs inside it:
- *HSN Rates* — the existing HSN table, unchanged.
- *Product & Service Rates* — the named rate list currently in Settings, with the same add/edit/archive behaviour (it keeps using the existing add/edit page).

The Settings tab is removed and anyone landing on the old settings tax links is sent to the Master Data page. No data is migrated or deleted, so pharmacy and service tax links keep working exactly as they do now.

## Technical notes

- `supabase/functions/generate-invoice-pdf/index.ts`: compute the logo height/width, track `y` from the drawn image bottom; redeploy the function after the change.
- Migration: add `consultation_hsn text` to `public.staff` (nullable).
- `src/pages/StaffManagement.tsx`: HSN select populated from active `hsn_tax_master` rows; include in insert/update payloads.
- `src/pages/Billing.tsx`: replace the literal `hsn: "9993"` in the doctor-fee line with the selected staff's `consultation_hsn`, resolving GST through the existing `hsnTaxMap`.
- Tax Master consolidation: move the `tax_master` list JSX/queries out of `src/pages/Settings.tsx` into `src/pages/TaxMaster.tsx` as a second tab; keep routes `/settings/tax-master/new` and `/settings/tax-master/:id` for the form; drop the Settings tab trigger.
