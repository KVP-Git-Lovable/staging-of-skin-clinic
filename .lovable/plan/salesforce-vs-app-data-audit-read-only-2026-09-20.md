# Salesforce vs app data audit (read-only)

Nothing was changed, deleted or re-imported. Every number below was queried live
from Salesforce and from the app database today.

## 1 & 2. Record counts and true missing sets

Missing counts are exact: every Salesforce Id was pulled and compared against the
app's stored Salesforce Id, not sampled.

| Object | Salesforce | In app | Missing here | In app, not in Salesforce |
|---|---|---|---|---|
| Patients | 27,017 | 27,017 | 0 | 0 |
| Appointments | 56,211 | 56,276 | 45 | 110 |
| Bills | 46,832 | 46,785 | 48 | 1 |
| Diagnoses (prescriptions) | 21,972 | 21,941 | 31 | 0 |
| Therapy notes | 15,260 | 15,158 | 102 | 0 |
| Photo files | 85,258 | 84,094 | 1,169 | 5 |
| Document files | 41,052 | 40,354 | 698 | 0 |

Photos/documents are counted as actual files (the file attached to a Salesforce
"Notes & Pictures" record), because one such record can hold several files.
Salesforce has 53,256 Notes & Pictures records: 17,847 Pictures and 35,409 of the
document types (Consent, Prescription, Doctor Notes, Lab reports, Other).

Example missing Salesforce Ids (first 12 of each; full lists available):

- Appointments: a08OW000012cfzdYAA, a08OW000012dlbyYAA, a08OW000012f7GqYAI, a08OW000012gy4bYAA, a08OW000012hpTvYAI, a08OW000012hqJdYAI, a08OW000012i4izYAA, a08OW000012kJkVYAU, a08OW000012mqKPYAY, a08OW000012pBsjYAE, a08OW000012rxBfYAI, a08OW000012sEsRYAU
- Bills: a0AOW00000KSToL2AX, a0AOW00000ZIDkD2AX, a0AOW00000ZIEBd2AP, a0AOW00000ZIFnd2AH, a0AOW00000ZIRSD2A5, a0AOW00000ZIWrh2AH, a0AOW00000ZIgfl2AD, a0AOW00000ZJOYj2AP, a0AOW00000ZJUUT2A5, a0AOW00000ZJZtx2AH, a0AOW00000ZJaTR2A1, a0AOW00000ZJuIT2A1
- Diagnoses: a0F2w000004CA4BEAW, a0F2w000004CEyUEAW, a0F2w000007Ab87EAC, a0F2w000007Ab8CEAS, a0F9F000000Ex1FUAS, a0F9F000000FjcUUAS, a0F9F000000FkKMUA0, a0F9F000000FkL1UAK, a0F9F000000FkLBUA0, a0F9F000000FkLLUA0, a0F9F000000FkLaUAK, a0F9F000000FkacUAC
- Therapy notes: a0b9F000008hcrSQAQ, a0b9F000008oCEkQAM, a0b9F0000095jP0QAI, a0bOW0000003MNNYA2, a0bOW0000004GqzYAE, a0bOW0000005bq9YAA, a0bOW000000EXTxYAO, a0bOW000000FyzxYAC, a0bOW000000HzrtYAC, a0bOW000000Lq3dYAC, a0bOW000000O381YAC, a0bOW000000ZJ2zYAG

Other structural observations (not loss, but worth knowing):

- 110 appointments and 1 bill carry a Salesforce Id that no longer exists in
  Salesforce — almost certainly records deleted there after import.
- 49 appointments, 114 bills and 15,860 prescriptions have no Salesforce Id at
  all: these were created in the app (the importer also creates a consultation
  record per visit).
- patient_photos holds 4,739 rows that repeat a file already stored under a
  different row — duplicate photo rows, same underlying Salesforce file.

## 3. Field quality on 25 random imported records of each type

Diagnoses (25 sampled): diagnosis text, symptoms, prescription notes and dates
matched exactly. Two systematic issues:

- **Lab tests are never imported.** 5,362 Salesforce diagnoses carry
  Required_Lab_Test_s__c; the app column `procedures.lab_tests` is populated on
  **0** rows. 6 of the 25 sampled showed this.
- `recommendations` in the app is filled from a different Salesforce field than
  Advice__c (Advice__c is populated on only 2 records org-wide), so those
  "differences" are not loss.

Whole-object field coverage confirms the rest is faithful: Salesforce has 18,987
diagnoses with diagnosis text (app: 18,961), 9,209 with symptoms (app: 9,194),
14,616 with prescription text (app: 14,589) — the small shortfalls are exactly
the 31 missing records.

Bills (25 sampled): totals, payment mode and dates all matched. Tax differs by
design — Salesforce records tax on 2,034 bills, the app shows tax on 10,002,
because the app recalculates GST from the HSN/tax master instead of copying the
Salesforce figure. Confirm this is intended; it changes printed invoices.

Appointments (25 sampled): start times matched on every record. Two systematic
rewrites: Salesforce status "Confirmed" is stored as "Completed" for past visits
(Salesforce: 55,845 Confirmed / 278 Follow Up / 51 Cancelled; app: 48,114
Completed / 8,015 Confirmed / 147 Cancelled), and doctor names are normalised
("Dr. Vindhya Pai  M.B.B.S. MD" → "Dr Vindhya Pai"). No values were lost.

## 4. The three suspicions

**a) Diagnosis date — CONFIRMED, and there is no better field on the record.**
Diagnosis__c has no clinical date field (only CreatedDate and
Follow_Up_Date__c). However every one of the 21,972 diagnoses is linked to an
appointment, and on a 200-record check the appointment's date equals CreatedDate
in every case. The correct source, if you want certainty, is
`Appointment__r.Start_Time__c` rather than CreatedDate.

**b) Structured medicine lines — CONFIRMED as never imported.** Diagnosis__c
carries up to 15 product lookups (Product__c, Product1__c … Product14__c) with
matching quantity, unit of measure and doctor-instruction fields. **10,418
diagnoses hold 38,504 product lines.** The app's `prescriptions` table has **32
rows**; medicines survive only as free text inside `procedure_notes`.

**c) Photo/document backlog — DENIED as a large backlog.** Only 10 patients are
unprocessed for photos and 7 for documents (of 27,017). The real gap is
file-level: 1,169 photo files and 698 document files whose patient was marked
synced but whose file failed or was skipped during download.

## 5. Verdict

- Patients — COMPLETE (0 missing).
- Appointments — INCOMPLETE, 45 missing.
- Bills — INCOMPLETE, 48 missing.
- Diagnoses — INCOMPLETE, 31 missing.
- Therapy notes — INCOMPLETE, 102 missing.
- Photos — INCOMPLETE, 1,169 files missing.
- Documents — INCOMPLETE, 698 files missing.
- Medicine lines — NOT IMPORTED AT ALL, 38,504 lines across 10,418 diagnoses.
- Lab tests — NOT IMPORTED AT ALL, 5,362 diagnoses affected.

## What it would take to close each gap (not done, awaiting your go-ahead)

1. **45/48/31 missing appointments, bills, diagnoses** — they belong to patients
   already marked as synced, so the existing importer will never revisit them. A
   targeted top-up that takes the exact Salesforce Id list and imports only those
   records. Small, one-off, idempotent.
2. **102 therapy notes** — same approach; most are notes whose appointment could
   not be matched, so they would attach to the patient's visit on that date or be
   reported as unattachable.
3. **1,169 photo + 698 document files** — a file-level top-up keyed on the
   Salesforce file Id rather than the per-patient "synced" marker, plus removal
   of the 4,739 duplicate photo rows.
4. **Lab tests** — add `Required_Lab_Test_s__c` to the diagnosis import and
   backfill 5,362 records into `procedures.lab_tests`; the column and the
   printed prescription already expect it.
5. **Medicine lines** — the larger job: read the 15 product/quantity/UOM/
   instruction field groups, match each product to the pharmacy master, and write
   real `prescriptions` rows (38,504). This makes medicines searchable,
   reportable and stock-aware instead of free text.
6. **Diagnosis dates** — optionally re-stamp `procedure_date` from the linked
   appointment's start time instead of CreatedDate.
