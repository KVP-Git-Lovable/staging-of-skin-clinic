// Field config for Billing's saved-views system. Keys intentionally match
// the existing BILLING_FIELDS/DEFAULT_BILLING_FIELDS column keys already
// used by Billing.tsx's table rendering (shouldShowColumn etc.), so
// swapping the view-management layer to the shared engine needs no changes
// to how columns are displayed.
import type { FieldDef } from "./engine";

export const BILLING_VIEW_FIELDS: FieldDef[] = [
  { key: "invoice_number", label: "Invoice #", type: "text" },
  { key: "patient_name", label: "Patient", type: "text" },
  { key: "total_amount", label: "Total Amount", type: "number" },
  { key: "paid_amount", label: "Paid Amount", type: "number" },
  { key: "status", label: "Status", type: "picklist", optionsSource: "status" },
  { key: "payment_mode", label: "Payment Mode", type: "picklist", optionsSource: "payment_mode" },
  { key: "created_at", label: "Date", type: "date" },
];

export const DEFAULT_BILLING_VIEW_COLUMNS = ["invoice_number", "patient_name", "total_amount", "status"];
