// Case/whitespace-insensitive name comparison, shared by anything that needs
// to match a freeform name (e.g. from a CSV import or a Salesforce sync)
// against existing records without creating near-duplicate rows.
export const normalizeName = (v: any): string =>
  String(v ?? "").toLowerCase().trim().replace(/\s+/g, " ");
