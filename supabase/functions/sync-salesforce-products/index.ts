import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

interface SalesforceProduct {
  Id: string;
  Name: string;
  Product_category__c?: string | null;
  Product_Code__c?: string | null;
  Product_details__c?: string | null;
  Standard_instruction_from_Dr__c?: string | null;
  Selling_unit_of_measure_UOM__c?: string | null;
  Minimum_inventory_Order_quantity__c?: number | null;
  Prescription_quantity__c?: number | null;
  Quantity_Available__c?: number | null;
  RecordType?: { Name?: string | null } | null;
}

interface SyncLog {
  imported: number;
  updated: number;
  linkedByName: number;
  skipped: number;
  removedLegacy: number;
  errors: string[];
}

interface ExistingProduct {
  id: string;
  name: string;
  salesforce_id: string | null;
}

interface LegacyCleanupCandidate extends ExistingProduct {
  category: string | null;
  pharma_inventory?: Array<{ id: string }> | null;
  pharma_bill_items?: Array<{ id: string }> | null;
  cart_items?: Array<{ id: string }> | null;
  product_prices?: Array<{ id: string }> | null;
  service_medicines?: Array<{ id: string }> | null;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleUnit(unit: string | null): string {
  const cleaned = asText(unit);
  if (!cleaned) return "Nos";
  const lower = cleaned.toLowerCase();
  if (["piece", "pieces", "pcs", "nos", "no"].includes(lower)) return "Nos";
  if (lower === "tablet" || lower === "tablets") return "Tablet";
  if (lower === "ml") return "ml";
  if (lower === "gm" || lower === "g" || lower === "gram") return "gm";
  return cleaned;
}

function firstReliableDuration(texts: Array<string | null | undefined>): string | null {
  const text = texts.filter(Boolean).join(". ");
  if (!text) return null;

  const patterns = [
    /\bfor\s+(\d+\s*(?:day|days|week|weeks|month|months))\b/i,
    /\bfor\s+(\d+\s*(?:wk|wks|mo|mos))\b/i,
    /\b(\d+\s*(?:day|days|week|weeks|month|months))\s+(?:course|duration)\b/i,
    /\bcontinue\s+(?:for\s+)?(\d+\s*(?:day|days|week|weeks|month|months))\b/i,
    /\buse\s+(?:for\s+)?(\d+\s*(?:day|days|week|weeks|month|months))\b/i,
    /\bonce\s+(?:daily\s+)?for\s+(\d+\s*(?:day|days|week|weeks|month|months))\b/i,
    /\btwice\s+(?:daily\s+)?for\s+(\d+\s*(?:day|days|week|weeks|month|months))\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

async function fetchSalesforceProducts(lovableApiKey: string, salesforceApiKey: string): Promise<SalesforceProduct[]> {
  const products: SalesforceProduct[] = [];
  const soql = `
    SELECT Id, Name, RecordType.Name, Product_category__c, Product_Code__c,
           Product_details__c, Standard_instruction_from_Dr__c,
           Selling_unit_of_measure_UOM__c, Minimum_inventory_Order_quantity__c,
           Prescription_quantity__c, Quantity_Available__c
    FROM Product__c
    WHERE RecordType.Name = 'Product master'
    ORDER BY Name
  `;

  let url: string | null = `${GATEWAY_URL}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const response: Response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "X-Connection-Api-Key": salesforceApiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Salesforce product query failed [${response.status}]: ${errorBody}`);
      throw new Error(`Salesforce product query failed [${response.status}]: ${errorBody}`);
    }

    const payload: { records?: SalesforceProduct[]; done?: boolean; nextRecordsUrl?: string } = await response.json();
    products.push(...(payload.records || []));
    if (payload.done || !payload.nextRecordsUrl) break;
    url = `${GATEWAY_URL}${payload.nextRecordsUrl.replace("/services/data/v62.0", "")}`;
  }

  return products;
}

function productPayload(product: SalesforceProduct) {
  const unit = titleUnit(product.Selling_unit_of_measure_UOM__c || null);
  const details = asText(product.Product_details__c);
  const doctorInstructions = asText(product.Standard_instruction_from_Dr__c);
  const instructions = doctorInstructions || details;
  const duration = firstReliableDuration([doctorInstructions, details]);
  const reorder = Number(product.Minimum_inventory_Order_quantity__c || 0);

  return {
    salesforce_id: product.Id,
    name: product.Name.trim(),
    generic_name: null,
    category: asText(product.Product_category__c) || "General",
    manufacturer: null,
    unit,
    base_unit: unit,
    purchase_unit: unit,
    sale_unit: unit,
    hsn_code: asText(product.Product_Code__c),
    gst_percent: 0,
    igst_percent: 0,
    cgst_percent: 0,
    mrp: 0,
    selling_price: 0,
    reorder_level: reorder > 0 ? Math.round(reorder) : 10,
    qty_per_unit: Number(product.Prescription_quantity__c || 0) > 0 ? Math.round(Number(product.Prescription_quantity__c)) : 1,
    default_duration: duration,
    duration,
    default_instructions: instructions,
    instructions: details,
    storage_instructions: null,
    side_effects: null,
    conversion_value: 1,
  };
}

async function removeLegacyProduct2Mistakes(supabase: ReturnType<typeof createClient>, products: SalesforceProduct[], log: SyncLog) {
  const validProductNames = new Set(products.map((p) => normalizeName(p.Name)));
  const { data: candidates, error } = await supabase
    .from("pharma_products")
    .select("id, name, salesforce_id, category, pharma_inventory(id), pharma_bill_items(id), cart_items(id), product_prices(id), service_medicines(id)")
    .is("salesforce_id", null)
    .eq("category", "General")
    .eq("mrp", 0)
    .eq("selling_price", 0);

  if (error) {
    log.errors.push(`Legacy cleanup lookup failed: ${error.message}`);
    return;
  }

  const removableIds = ((candidates || []) as LegacyCleanupCandidate[])
    .filter((row) => !validProductNames.has(normalizeName(row.name || "")))
    .filter((row) => {
      const linked =
        (row.pharma_inventory || []).length +
        (row.pharma_bill_items || []).length +
        (row.cart_items || []).length +
        (row.product_prices || []).length +
        (row.service_medicines || []).length;
      return linked === 0;
    })
    .map((row) => row.id);

  if (removableIds.length === 0) return;

  const { error: deleteError } = await supabase.from("pharma_products").delete().in("id", removableIds);
  if (deleteError) {
    log.errors.push(`Legacy cleanup failed: ${deleteError.message}`);
    return;
  }

  log.removedLegacy = removableIds.length;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function saveProducts(supabase: ReturnType<typeof createClient>, products: SalesforceProduct[], log: SyncLog) {
  const { data: existingRows, error: existingError } = await supabase
    .from("pharma_products")
    .select("id, name, salesforce_id");

  if (existingError) throw existingError;

  const existing = (existingRows || []) as ExistingProduct[];
  const beforeLinked = existing.filter((row) => row.salesforce_id).length;
  const unlinkedByName = new Map<string, ExistingProduct[]>();

  existing
    .filter((row) => !row.salesforce_id)
    .forEach((row) => {
      const key = normalizeName(row.name);
      unlinkedByName.set(key, [...(unlinkedByName.get(key) || []), row]);
    });

  const nameMatchUpdates: Array<ReturnType<typeof productPayload> & { id: string }> = [];
  const allPayloads: Array<ReturnType<typeof productPayload>> = [];

  for (const product of products) {
    const cleanName = asText(product.Name);
    if (!cleanName) {
      log.skipped += 1;
      continue;
    }

    const payload = productPayload({ ...product, Name: cleanName });
    allPayloads.push(payload);

    const nameMatches = unlinkedByName.get(normalizeName(cleanName)) || [];
    if (nameMatches.length === 1) {
      nameMatchUpdates.push({ id: nameMatches[0].id, ...payload });
      log.linkedByName += 1;
    }
  }

  for (const batch of chunk(nameMatchUpdates, 100)) {
    const { error } = await supabase.from("pharma_products").upsert(batch, { onConflict: "id" });
    if (error) log.errors.push(`Name-link pass skipped for ${batch.length} products: ${error.message}`);
  }

  for (const batch of chunk(allPayloads, 100)) {
    const { error } = await supabase.from("pharma_products").upsert(batch, { onConflict: "salesforce_id" });
    if (error) throw error;
  }

  const { count: afterLinked, error: countError } = await supabase
    .from("pharma_products")
    .select("id", { count: "exact", head: true })
    .not("salesforce_id", "is", null);
  if (countError) throw countError;

  log.imported = Math.max(0, (afterLinked || 0) - beforeLinked);
  log.updated = Math.max(0, products.length - log.imported - log.skipped);

  if (nameMatchUpdates.length > 0) {
    const linkedIds = nameMatchUpdates.map((row) => row.id);
    const { error: duplicateDeleteError } = await supabase
      .from("pharma_products")
      .delete()
      .in("id", linkedIds)
      .is("salesforce_id", null)
      .eq("mrp", 0)
      .eq("selling_price", 0);
    if (duplicateDeleteError) log.errors.push(`Duplicate cleanup skipped: ${duplicateDeleteError.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const salesforceApiKey = Deno.env.get("SALESFORCE_API_KEY");

  if (!supabaseUrl || !supabaseKey || !lovableApiKey || !salesforceApiKey) {
    console.error("Missing required product sync environment variables", {
      supabaseUrl: Boolean(supabaseUrl),
      supabaseKey: Boolean(supabaseKey),
      lovableApiKey: Boolean(lovableApiKey),
      salesforceApiKey: Boolean(salesforceApiKey),
    });
    return new Response(JSON.stringify({ success: false, error: "Product sync is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const products = await fetchSalesforceProducts(lovableApiKey, salesforceApiKey);
    const log: SyncLog = { imported: 0, updated: 0, linkedByName: 0, skipped: 0, removedLegacy: 0, errors: [] };

    await removeLegacyProduct2Mistakes(supabase, products, log);

    await saveProducts(supabase, products, log);

    return new Response(
      JSON.stringify({
        success: log.errors.length === 0,
        source: "Product__c",
        filter: "RecordType.Name = Product master",
        total: products.length,
        imported: log.imported,
        updated: log.updated,
        linkedByName: log.linkedByName,
        skipped: log.skipped,
        removedLegacy: log.removedLegacy,
        errors: log.errors.length > 0 ? log.errors : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: log.errors.length > 0 ? 207 : 200 },
    );
  } catch (error) {
    console.error("Product sync error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Failed to sync products",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});