export type FieldType = "text" | "number" | "date" | "datetime" | "boolean" | "picklist";

export interface ValidationField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
}

export interface ValidationObject {
  key: string;
  label: string;
  table: string;
  fields: ValidationField[];
}

export const VALIDATION_OBJECTS: ValidationObject[] = [
  {
    key: "patients",
    label: "Patients",
    table: "patients",
    fields: [
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "gender", label: "Gender", type: "picklist", options: ["Male", "Female", "Other"] },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "pincode", label: "Pincode", type: "text" },
      { key: "blood_group", label: "Blood Group", type: "picklist", options: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"] },
      { key: "skin_type", label: "Skin Type", type: "text" },
      { key: "allergies", label: "Allergies", type: "text" },
      { key: "source", label: "Source", type: "text" },
      { key: "status", label: "Status", type: "picklist", options: ["Active", "Inactive"] },
      { key: "emergency_contact_name", label: "Emergency Contact Name", type: "text" },
      { key: "emergency_contact_phone", label: "Emergency Contact Phone", type: "text" },
    ],
  },
  {
    key: "appointments",
    label: "Appointments",
    table: "appointments",
    fields: [
      { key: "patient_name", label: "Patient Name", type: "text" },
      { key: "service", label: "Service", type: "text" },
      { key: "start_time", label: "Start Time", type: "datetime" },
      { key: "end_time", label: "End Time", type: "datetime" },
      { key: "status", label: "Status", type: "picklist", options: ["Reserved", "Confirmed", "Checked In", "Completed", "Cancelled", "No Show", "Scheduled", "No-show"] },
      { key: "appointment_type", label: "Appointment Type", type: "text" },
      { key: "consultation_type", label: "Consultation Type", type: "text" },
      { key: "reason_for_consultation", label: "Reason for Consultation", type: "text" },
      { key: "visit_status", label: "Visit Status", type: "text" },
      { key: "source", label: "Source", type: "text" },
      { key: "is_recurring", label: "Is Recurring", type: "boolean" },
    ],
  },
  {
    key: "procedures",
    label: "Procedures",
    table: "procedures",
    fields: [
      { key: "service_name", label: "Service Name", type: "text" },
      { key: "diagnosis", label: "Diagnosis", type: "text" },
      { key: "symptoms", label: "Symptoms", type: "text" },
      { key: "procedure_notes", label: "Procedure Notes", type: "text" },
      { key: "consultation_notes", label: "Consultation Notes", type: "text" },
      { key: "recommendations", label: "Recommendations", type: "text" },
      { key: "status", label: "Status", type: "picklist", options: ["Draft", "Completed", "Reviewed"] },
      { key: "procedure_date", label: "Procedure Date", type: "datetime" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    table: "invoices",
    fields: [
      { key: "invoice_number", label: "Invoice Number", type: "text" },
      { key: "patient_name", label: "Patient Name", type: "text" },
      { key: "total_amount", label: "Total Amount", type: "number" },
      { key: "paid_amount", label: "Paid Amount", type: "number" },
      { key: "status", label: "Status", type: "picklist", options: ["Draft", "Unpaid", "Partially Paid", "Paid", "Cancelled"] },
      { key: "payment_type", label: "Payment Type", type: "text" },
      { key: "payment_mode", label: "Payment Mode", type: "text" },
      { key: "tax_rate", label: "Tax Rate", type: "number" },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  {
    key: "pharma_products",
    label: "Pharma Products",
    table: "pharma_products",
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "generic_name", label: "Generic Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "hsn_code", label: "HSN Code", type: "text" },
      { key: "gst_percent", label: "GST %", type: "number" },
      { key: "mrp", label: "MRP", type: "number" },
      { key: "selling_price", label: "Selling Price", type: "number" },
      { key: "reorder_level", label: "Reorder Level", type: "number" },
      { key: "expiry_date", label: "Expiry Date", type: "date" },
    ],
  },
];

export function getObject(key: string) {
  return VALIDATION_OBJECTS.find((o) => o.key === key) || null;
}

export function getField(objectKey: string, fieldKey: string) {
  return getObject(objectKey)?.fields.find((f) => f.key === fieldKey) || null;
}

export const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  text: [
    { value: "is", label: "is" },
    { value: "isnt", label: "isn't" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "starts_with", label: "starts with" },
    { value: "ends_with", label: "ends with" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
    { value: "matches", label: "matches pattern" },
    { value: "length_gt", label: "length greater than" },
    { value: "length_lt", label: "length less than" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "gt", label: ">" },
    { value: "gte", label: ">=" },
    { value: "lt", label: "<" },
    { value: "lte", label: "<=" },
    { value: "between", label: "between" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  date: [
    { value: "on", label: "is on" },
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "between", label: "between" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  datetime: [
    { value: "on", label: "is on" },
    { value: "before", label: "is before" },
    { value: "after", label: "is after" },
    { value: "between", label: "between" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  boolean: [
    { value: "is_true", label: "is checked" },
    { value: "is_false", label: "is unchecked" },
  ],
  picklist: [
    { value: "is", label: "is" },
    { value: "isnt", label: "isn't" },
    { value: "in", label: "is one of" },
    { value: "not_in", label: "is none of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

export function operatorsFor(type: FieldType) {
  return OPERATORS_BY_TYPE[type] || OPERATORS_BY_TYPE.text;
}

export function operatorLabel(type: FieldType, op: string) {
  return operatorsFor(type).find((o) => o.value === op)?.label || op;
}

export const NO_VALUE_OPERATORS = ["is_empty", "is_not_empty", "is_true", "is_false"];