// expenses.vendor_name is a text column holding the vendor's NAME. Some rows
// were saved with the vendor's id by mistake; resolve those back to the name.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface VendorRef { id: string; name: string }

export function resolveVendorName(value: string | null | undefined, vendors: VendorRef[]): string {
  const v = (value ?? "").trim();
  if (!v || !UUID_RE.test(v)) return v;
  return vendors.find((x) => x.id === v)?.name ?? v;
}
