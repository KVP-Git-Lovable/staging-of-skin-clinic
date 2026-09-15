export interface ReportField {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean";
}

export interface ReportObject {
  key: string;
  label: string;
  table: string;
  fields: ReportField[];
  relations?: { objectKey: string; foreignKey: string; label: string }[];
}

export const REPORT_OBJECTS: ReportObject[] = [
  {
    key: "patients",
    label: "Patients",
    table: "patients",
    fields: [
      { key: "id", label: "Patient ID", type: "text" },
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "gender", label: "Gender", type: "text" },
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "blood_group", label: "Blood Group", type: "text" },
      { key: "skin_type", label: "Skin Type", type: "text" },
      { key: "allergies", label: "Allergies", type: "text" },
      { key: "follows_facebook", label: "Follows Facebook", type: "boolean" },
      { key: "follows_instagram", label: "Follows Instagram", type: "boolean" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
    relations: [
      { objectKey: "appointments", foreignKey: "patient_id", label: "Appointments" },
      { objectKey: "procedures", foreignKey: "patient_id", label: "Procedures" },
      { objectKey: "invoices", foreignKey: "patient_id", label: "Invoices" },
    ],
  },
  {
    key: "appointments",
    label: "Appointments",
    table: "appointments",
    fields: [
      { key: "id", label: "Appointment ID", type: "text" },
      { key: "patient_name", label: "Patient Name", type: "text" },
      { key: "service", label: "Service", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "start_time", label: "Start Time", type: "date" },
      { key: "end_time", label: "End Time", type: "date" },
      { key: "source", label: "Source", type: "text" },
      { key: "is_recurring", label: "Is Recurring", type: "boolean" },
      { key: "created_at", label: "Created At", type: "date" },
      { key: "staff_id", label: "Doctor ID", type: "text" },
      { key: "_doctor_name", label: "Doctor Name", type: "text" },
      { key: "_month", label: "Month", type: "text" },
    ],
    relations: [
      { objectKey: "patients", foreignKey: "patient_id", label: "Patients" },
      { objectKey: "staff", foreignKey: "staff_id", label: "Doctor" },
    ],
  },
  {
    key: "procedures",
    label: "Procedures",
    table: "procedures",
    fields: [
      { key: "id", label: "Procedure ID", type: "text" },
      { key: "service_name", label: "Service Name", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "procedure_date", label: "Procedure Date", type: "date" },
      { key: "diagnosis", label: "Diagnosis", type: "text" },
      { key: "consultation_notes", label: "Consultation Notes", type: "text" },
      { key: "recommendations", label: "Recommendations", type: "text" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
    relations: [
      { objectKey: "patients", foreignKey: "patient_id", label: "Patients" },
      { objectKey: "appointments", foreignKey: "appointment_id", label: "Appointments" },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    table: "invoices",
    fields: [
      { key: "id", label: "Invoice ID", type: "text" },
      { key: "invoice_number", label: "Invoice Number", type: "text" },
      { key: "patient_name", label: "Patient Name", type: "text" },
      { key: "total_amount", label: "Total Amount", type: "number" },
      { key: "paid_amount", label: "Paid Amount", type: "number" },
      { key: "tax_amount", label: "Tax Amount", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "payment_type", label: "Payment Type", type: "text" },
      { key: "payment_mode", label: "Payment Mode", type: "text" },
      { key: "created_at", label: "Created At", type: "date" },
      { key: "doctor_id", label: "Doctor ID", type: "text" },
      { key: "_doctor_name", label: "Doctor Name", type: "text" },
      { key: "_month", label: "Month", type: "text" },
      { key: "_sum_total_amount", label: "Total Revenue", type: "number" },
      { key: "_sum_paid_amount", label: "Total Collected", type: "number" },
      { key: "_count", label: "Transaction Count", type: "number" },
      { key: "_count_distinct_patient_id", label: "Number of Patients", type: "number" },
    ],
    relations: [
      { objectKey: "patients", foreignKey: "patient_id", label: "Patients" },
      { objectKey: "appointments", foreignKey: "appointment_id", label: "Appointments" },
      { objectKey: "staff", foreignKey: "doctor_id", label: "Doctor" },
    ],
  },
  {
    key: "services",
    label: "Services",
    table: "services",
    fields: [
      { key: "id", label: "Service ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "price", label: "Price", type: "number" },
      { key: "duration", label: "Duration (min)", type: "number" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
  },
  {
    key: "staff",
    label: "Staff",
    table: "staff",
    fields: [
      { key: "id", label: "Staff ID", type: "text" },
      { key: "first_name", label: "First Name", type: "text" },
      { key: "last_name", label: "Last Name", type: "text" },
      { key: "role", label: "Role", type: "text" },
      { key: "specialization", label: "Specialization", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "created_at", label: "Created At", type: "date" },
      { key: "_full_name", label: "Full Name", type: "text" },
    ],
  },
  {
    key: "assets",
    label: "Assets",
    table: "assets",
    fields: [
      { key: "id", label: "Asset ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "condition", label: "Condition", type: "text" },
      { key: "location", label: "Location", type: "text" },
      { key: "purchase_price", label: "Purchase Price", type: "number" },
      { key: "purchase_date", label: "Purchase Date", type: "date" },
      { key: "warranty_start_date", label: "Warranty Start", type: "date" },
      { key: "warranty_end_date", label: "Warranty End", type: "date" },
      { key: "amc_cost", label: "AMC Cost", type: "number" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
    relations: [
      { objectKey: "vendors", foreignKey: "vendor_id", label: "Vendors" },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    table: "vendors",
    fields: [
      { key: "id", label: "Vendor ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "contact_person", label: "Contact Person", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "is_active", label: "Active", type: "boolean" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
  },
  {
    key: "pharma_products",
    label: "Pharma Products",
    table: "pharma_products",
    fields: [
      { key: "id", label: "Product ID", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "generic_name", label: "Generic Name", type: "text" },
      { key: "manufacturer", label: "Manufacturer", type: "text" },
      { key: "mrp", label: "MRP", type: "number" },
      { key: "selling_price", label: "Selling Price", type: "number" },
      { key: "gst_percent", label: "GST %", type: "number" },
      { key: "reorder_level", label: "Reorder Level", type: "number" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
  },
  {
    key: "leave_applications",
    label: "Leave Applications",
    table: "leave_applications",
    fields: [
      { key: "id", label: "Leave ID", type: "text" },
      { key: "start_date", label: "Start Date", type: "date" },
      { key: "end_date", label: "End Date", type: "date" },
      { key: "days", label: "Days", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "reason", label: "Reason", type: "text" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
    relations: [
      { objectKey: "staff", foreignKey: "staff_id", label: "Staff" },
    ],
  },
  {
    key: "asset_issues",
    label: "Asset Issues",
    table: "asset_issues",
    fields: [
      { key: "id", label: "Issue ID", type: "text" },
      { key: "title", label: "Title", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "priority", label: "Priority", type: "text" },
      { key: "cost", label: "Cost", type: "number" },
      { key: "reported_by", label: "Reported By", type: "text" },
      { key: "reported_date", label: "Reported Date", type: "date" },
      { key: "resolved_date", label: "Resolved Date", type: "date" },
      { key: "created_at", label: "Created At", type: "date" },
    ],
    relations: [
      { objectKey: "assets", foreignKey: "asset_id", label: "Assets" },
      { objectKey: "vendors", foreignKey: "vendor_id", label: "Vendors" },
    ],
  },
  {
    key: "patient_feedback",
    label: "Patient Feedback",
    table: "patient_feedback",
    fields: [
      { key: "id", label: "Feedback ID", type: "text" },
      { key: "appointment_id", label: "Appointment ID", type: "text" },
      { key: "patient_id", label: "Patient ID", type: "text" },
      { key: "patient_name", label: "Patient Name", type: "text" },
      { key: "nps_score", label: "NPS Score", type: "number" },
      { key: "service_rating", label: "Star Rating", type: "number" },
      { key: "created_at", label: "Submitted At", type: "date" },
      { key: "_month", label: "Month", type: "text" },
      { key: "_avg_nps_score", label: "Average NPS Score", type: "number" },
      { key: "_avg_service_rating", label: "Average Star Rating", type: "number" },
      { key: "_count", label: "Total Submissions", type: "number" },
    ],
    relations: [
      { objectKey: "appointments", foreignKey: "appointment_id", label: "Appointments" },
      { objectKey: "patients", foreignKey: "patient_id", label: "Patients" },
    ],
  },
];

export const getObjectByKey = (key: string) =>
  REPORT_OBJECTS.find((o) => o.key === key);

/**
 * Returns true if `fk` (e.g. "patients.first_name") references a field that
 * actually exists on one of the allowed objects. Used to drop stale field
 * references from saved reports / leftover chips after switching objects.
 */
export const isValidFieldKey = (
  fk: string,
  allowedObjectKeys: (string | undefined | null)[]
): boolean => {
  if (!fk || typeof fk !== "string") return false;
  const [objKey, fieldKey] = fk.split(".");
  if (!objKey || !fieldKey) return false;
  if (!allowedObjectKeys.filter(Boolean).includes(objKey)) return false;
  const obj = getObjectByKey(objKey);
  if (!obj) return false;
  return obj.fields.some((f) => f.key === fieldKey);
};

export const getRelatedObjects = (primaryKey: string): ReportObject[] => {
  const primary = getObjectByKey(primaryKey);
  if (!primary?.relations) return [];
  return primary.relations
    .map((r) => getObjectByKey(r.objectKey))
    .filter(Boolean) as ReportObject[];
};

export interface JoinPreset {
  primary: string;
  related: string;
  label: string;
  fieldCount: number;
}

export const getJoinPresets = (): JoinPreset[] => {
  const presets: JoinPreset[] = [];
  const seen = new Set<string>();
  REPORT_OBJECTS.forEach((obj) => {
    obj.relations?.forEach((rel) => {
      const key = [obj.key, rel.objectKey].sort().join("+");
      if (seen.has(key)) return;
      seen.add(key);
      const relObj = getObjectByKey(rel.objectKey);
      if (!relObj) return;
      presets.push({
        primary: obj.key,
        related: rel.objectKey,
        label: `${obj.label} + ${relObj.label}`,
        fieldCount: obj.fields.length + relObj.fields.length,
      });
    });
  });
  return presets;
};

export const generateReportName = (primaryKey: string, relatedKey?: string): string => {
  const primary = getObjectByKey(primaryKey);
  if (!primary) return "New Report";
  if (relatedKey) {
    const related = getObjectByKey(relatedKey);
    return `${primary.label} + ${related?.label || ""} Report`;
  }
  return `${primary.label} Report`;
};

export type ReportFilterOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "does_not_contain"
  | "starts_with"
  | "ends_with"
  | "in"
  | "not_in"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "is_null"
  | "is_not_null";

export interface ReportFilter {
  field: string;
  operator: ReportFilterOperator;
  value: string;
  objectKey: string;
}

export const OPERATOR_LABELS: Record<ReportFilterOperator, string> = {
  equals: "equals",
  not_equals: "not equal to",
  contains: "contains",
  does_not_contain: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  in: "is one of",
  not_in: "is none of",
  gt: "greater than",
  lt: "less than",
  gte: "greater or equal",
  lte: "less or equal",
  is_null: "is empty",
  is_not_null: "is not empty",
};

/** Salesforce-style operator set, scoped to the field's data type. */
export const getOperatorsForType = (
  type: ReportField["type"] | undefined
): ReportFilterOperator[] => {
  switch (type) {
    case "number":
      return ["equals", "not_equals", "gt", "gte", "lt", "lte", "in", "not_in", "is_null", "is_not_null"];
    case "date":
      return ["equals", "not_equals", "gt", "gte", "lt", "lte", "is_null", "is_not_null"];
    case "boolean":
      return ["equals", "not_equals", "is_null", "is_not_null"];
    default:
      return [
        "equals",
        "not_equals",
        "contains",
        "does_not_contain",
        "starts_with",
        "ends_with",
        "in",
        "not_in",
        "is_null",
        "is_not_null",
      ];
  }
};

export const operatorNeedsValue = (op: ReportFilterOperator) =>
  op !== "is_null" && op !== "is_not_null";

export const getFieldDef = (fieldKey: string): ReportField | undefined => {
  const [objKey, fk] = (fieldKey || "").split(".");
  return getObjectByKey(objKey)?.fields.find((f) => f.key === fk);
};

/**
 * Evaluate Salesforce-style filter logic, e.g. "1 AND (2 OR 3)".
 * `results` is 0-indexed; the expression is 1-indexed.
 * Falls back to AND of everything when the expression is empty/invalid.
 */
export const evaluateFilterLogic = (logic: string | undefined, results: boolean[]): boolean => {
  const all = results.every(Boolean);
  if (!logic || !logic.trim()) return all;
  const tokens = logic.match(/\d+|AND|OR|NOT|\(|\)/gi);
  if (!tokens) return all;
  const js = tokens
    .map((t) => {
      if (/^\d+$/.test(t)) {
        const idx = parseInt(t, 10) - 1;
        if (idx < 0 || idx >= results.length) return null;
        return results[idx] ? "true" : "false";
      }
      const up = t.toUpperCase();
      if (up === "AND") return "&&";
      if (up === "OR") return "||";
      if (up === "NOT") return "!";
      return t;
    })
    .join(" ");
  if (js.includes("null")) return all;
  try {
    // Only booleans and operators remain, so this is safe to evaluate.
    // eslint-disable-next-line no-new-func
    return !!new Function(`return (${js});`)();
  } catch {
    return all;
  }
};

export interface ReportDisplayOptions {
  show_row_counts: boolean;
  show_subtotals: boolean;
  show_grand_total: boolean;
  /** Salesforce-style filter logic expression, e.g. "1 AND (2 OR 3)". Empty = AND all. */
  filter_logic?: string;
}

export const DEFAULT_DISPLAY_OPTIONS: ReportDisplayOptions = {
  show_row_counts: true,
  show_subtotals: false,
  show_grand_total: true,
  filter_logic: "",
};


export interface SavedReport {
  id?: string;
  name: string;
  description?: string;
  primary_object: string;
  related_object?: string;
  columns: string[];
  group_rows: string[];
  group_columns: string[];
  filters: ReportFilter[];
  chart_type: string;
  folder_id?: string | null;
  display_options?: ReportDisplayOptions;
  created_at?: string;
  updated_at?: string;
}

export const CHART_TYPES = [
  { key: "table", label: "Tabular", icon: "Table" },
  { key: "bar", label: "Vertical Bar", icon: "BarChart3" },
  { key: "hbar", label: "Horizontal Bar", icon: "BarChartHorizontal" },
  { key: "doughnut", label: "Doughnut Chart", icon: "PieChart" },
  { key: "line", label: "Line Chart", icon: "LineChart" },
  { key: "number", label: "Summary Number", icon: "Hash" },
];
