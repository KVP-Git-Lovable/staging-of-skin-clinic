/**
 * Reading a saved invoice back into the form that made it.
 *
 * Edit Invoice used to show only the header - patient, totals, payment, notes
 * - so what was actually billed could not be changed. Worse, the total was
 * freely typeable while the lines behind it were not, so an invoice edited
 * from 800 to 600 kept lines saying 800, and the printed copy is built from
 * the lines.
 *
 * Seeding the same serviceInputs/pharmaItems the create form uses means every
 * total, every tax split and the stored snapshot are computed by the code
 * that already exists, so the two forms cannot drift apart.
 */

export interface SeededService {
  name: string;
  price: number;
  hsn: string;
  gst: number;
  service_id?: string;
  material_percent?: string;
}

export interface SeededProduct {
  inventory_id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  available: number;
  uom: string;
  uom_factor: number;
}

const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function seedInvoiceLines(lineItems: unknown): { services: SeededService[]; products: SeededProduct[] } {
  const lines = Array.isArray(lineItems) ? (lineItems as Record<string, unknown>[]) : [];
  const services: SeededService[] = [];
  const products: SeededProduct[] = [];

  for (const line of lines) {
    if (!line || typeof line !== "object") continue;

    // Only a line explicitly marked a product is one. 55,854 of the lines in
    // this database carry no kind at all - they came from the Salesforce
    // promotion, and every one of them is a service. Treating "unknown" as a
    // product would move them into pharmacy and start touching stock.
    if (line.kind === "product") {
      products.push({
        inventory_id: String(line.inventory_id ?? ""),
        product_id: String(line.product_id ?? ""),
        product_name: String(line.name ?? ""),
        batch_number: String(line.batch_number ?? ""),
        quantity: Math.max(1, num(line.qty, 1)),
        unit_price: num(line.price),
        available: 0,
        uom: String(line.uom ?? ""),
        uom_factor: num(line.uom_factor, 1) || 1,
      });
      continue;
    }

    const name = String(line.name ?? "").trim();
    if (!name) continue;
    services.push({
      name,
      price: num(line.price),
      hsn: String(line.hsn ?? ""),
      gst: num(line.gst),
      service_id: line.service_id ? String(line.service_id) : undefined,
      material_percent:
        line.material_percent === null || line.material_percent === undefined
          ? ""
          : String(line.material_percent),
    });
  }

  return { services, products };
}
