import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function fmtINR(n: number) {
  return `INR ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sanitize(s: any): string {
  // Strip only control characters that WinAnsi cannot encode; preserve spaces.
  return String(s ?? "").replace(/[\u0000-\u001F\u007F]+/g, " ");
}

function pct(n: any) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

// Indian numbering number-to-words (integer rupees + paise)
function numberToIndianWords(num: number): string {
  if (!isFinite(num)) return "";
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  const words = inWords(rupees);
  let res = `${words} Rupees`;
  if (paise > 0) res += ` and ${inWords(paise)} Paise`;
  return `${res} Only`;
}
function inWords(n: number): string {
  if (n === 0) return "Zero";
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number): string => x < 20 ? a[x] : `${b[Math.floor(x/10)]}${x%10 ? " " + a[x%10] : ""}`;
  const three = (x: number): string => {
    const h = Math.floor(x/100), r = x%100;
    return `${h ? a[h] + " Hundred" + (r ? " " : "") : ""}${r ? two(r) : ""}`;
  };
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thou = Math.floor(n / 1000); n %= 1000;
  const hund = n;
  if (crore) parts.push(two(crore) + " Crore");
  if (lakh) parts.push(two(lakh) + " Lakh");
  if (thou) parts.push(two(thou) + " Thousand");
  if (hund) parts.push(three(hund));
  return parts.join(" ").trim();
}

function ageFromDob(dob?: string | null): string {
  if (!dob) return "";
  const d = new Date(dob);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  return String(Math.floor(diff / (365.25 * 24 * 3600 * 1000)));
}

function shortPatientId(id?: string | null): string {
  if (!id) return "";
  const hex = id.replace(/-/g, "");
  return `P-${hex.slice(-5).toUpperCase()}`;
}

function fmtDateIST(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  // dd/mm/yyyy in Asia/Kolkata
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
  return f.format(d);
}

function drawWrapped(page: PDFPage, text: string, x: number, y: number, maxWidth: number, font: PDFFont, size: number, color: any, lineHeight: number): number {
  const words = String(text).split(/\s+/);
  let line = "";
  let cy = y;
  for (const w of words) {
    const test = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(sanitize(test), size) <= maxWidth) {
      line = test;
    } else {
      page.drawText(sanitize(line), { x, y: cy, size, font, color });
      cy -= lineHeight;
      line = w;
    }
  }
  if (line) {
    page.drawText(sanitize(line), { x, y: cy, size, font, color });
    cy -= lineHeight;
  }
  return cy;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { invoiceId, wait } = await req.json();
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: inv, error: invErr } = await supabase
      .from("invoices").select("*").eq("id", invoiceId).maybeSingle();
    if (invErr || !inv) {
      return new Response(JSON.stringify({ error: "Invoice not found", details: invErr }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Synchronous mode: callers that need the URL right away (e.g. Download PDF).
    if (wait) {
      const result = await buildInvoicePdf(supabase, inv);
      if (result?.url) {
        await supabase.from("invoices").update({ pdf_url: result.url }).eq("id", invoiceId);
      }
      return new Response(JSON.stringify({ ok: true, url: result?.url ?? null }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build + upload the PDF in the background so callers don't block on it.
    const buildAndStore = async () => {
      try {
        const result = await buildInvoicePdf(supabase, inv);
        if (result?.url) {
          await supabase.from("invoices").update({ pdf_url: result.url }).eq("id", invoiceId);
        }
      } catch (e) {
        console.error("background PDF build failed:", e);
      }
    };
    // @ts-ignore EdgeRuntime is available in Supabase Edge Functions
    if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(buildAndStore());
    } else {
      // Fallback: fire-and-forget
      buildAndStore();
    }


    return new Response(JSON.stringify({ ok: true, queued: true }), {
      status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("generate-invoice-pdf error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function buildInvoicePdf(supabase: any, inv: any): Promise<{ url: string; path: string } | null> {
  const invoiceId = inv.id;
    const [{ data: clinic }, { data: patient }] = await Promise.all([
      supabase.from("clinic_settings").select("*").limit(1).maybeSingle(),
      inv.patient_id
        ? supabase.from("patients").select("*").eq("id", inv.patient_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Print exactly one "Dr." prefix and no specialization suffix.
    const formatDoctor = (first?: string | null, last?: string | null) => {
      const nm = `${first || ""} ${last || ""}`.trim().replace(/^(dr\.?\s*)+/i, "").trim();
      return nm ? `Dr. ${nm}` : "";
    };

    let doctorName = "";
    let apptServiceName = "";
    // Prefer the doctor explicitly chosen on the invoice; fall back to appointment staff.
    if (inv.doctor_id) {
      const { data: st } = await supabase
        .from("staff").select("first_name, last_name").eq("id", inv.doctor_id).maybeSingle();
      if (st) doctorName = formatDoctor(st.first_name, st.last_name);
    }
    // Fetched whenever there's a linked appointment (not only when doctorName
    // still needs resolving) - its service name is also the fallback used
    // below for a line item saved with just the generic "Service" placeholder.
    if (inv.appointment_id) {
      const { data: appt } = await supabase
        .from("appointments").select("staff_id, service").eq("id", inv.appointment_id).maybeSingle();
      // Salesforce's appointment "service" field is really a free-text
      // clinical note, not a clean procedure name, and often carries a
      // trailing "last session on <date>" annotation - strip that when
      // used as a display fallback (never touches the stored data).
      apptServiceName = String(appt?.service || "").replace(/\s*last\s+session\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/i, "").trim();
      if (!doctorName && appt?.staff_id) {
        const { data: st } = await supabase
          .from("staff").select("first_name, last_name").eq("id", appt.staff_id).maybeSingle();
        if (st) doctorName = formatDoctor(st.first_name, st.last_name);
      }
    }
    // Older Salesforce imports (and the earlier line_items backfill run
    // before this fix existed) can store a literal "Service" placeholder
    // name on a line item - prefer the linked appointment's real service
    // name over that placeholder, same fallback the frontend uses.
    const resolveItemName = (raw: string) => {
      const name = String(raw || "").trim();
      return name && name !== "Service" ? name : apptServiceName || "Service";
    };

    // Prefer the invoice's own stored CGST/SGST/IGST split (the same one the
    // in-app Invoice Details modal reads directly) over recomputing from
    // patient/clinic state. When there's no stored split, default to
    // intra-state (CGST+SGST) - the same unconditional 50/50 assumption
    // used everywhere else in this app (e.g. sf-import-clinical) - rather
    // than compare state text, which is unreliable when patient.state is
    // blank (common) and would otherwise silently fall through to
    // "different state" (all-IGST, 0.00%/0.00% CGST/SGST). Only treat it
    // as inter-state when both states are actually known and differ.
    const invHasStoredSplit = Number(inv.cgst_amount) > 0 || Number(inv.sgst_amount) > 0 || Number(inv.igst_amount) > 0;
    const clinicState = (clinic?.state || "").trim().toLowerCase();
    const patientState = (patient?.state || "").trim().toLowerCase();
    const bothStatesKnown = !!clinicState && !!patientState;
    const sameState = invHasStoredSplit
      ? Number(inv.igst_amount) <= 0
      : bothStatesKnown ? clinicState === patientState : true;

    // ── Active HSN rates from the Tax Master ──
    const { data: hsnRows } = await supabase
      .from("hsn_tax_master")
      .select("hsn_code, sgst, cgst, igst")
      .eq("is_active", true);
    const hsnMap = new Map<string, { sgst: number; cgst: number; igst: number; total: number }>();
    (hsnRows || []).forEach((h: any) => {
      const sgst = Number(h.sgst) || 0, cgst = Number(h.cgst) || 0, igst = Number(h.igst) || 0;
      hsnMap.set(String(h.hsn_code).trim(), { sgst, cgst, igst, total: sgst + cgst + igst });
    });
    const hsnRate = (hsn: any) => hsnMap.get(String(hsn ?? "").trim())?.total ?? 0;


    // ── Build line items: prefer the structured snapshot persisted on the invoice ──
    type LineRow = { name: string; qty: number; charges: number; hsn: string; sgst: number; cgst: number; igst: number; taxAmount: number; amount: number };
    let lineItems: LineRow[] = [];

    const buildFromRefs = async (parsed: { name: string; qty: number }[]): Promise<LineRow[]> => {
      const names = Array.from(new Set(parsed.map((p) => p.name)));
      const svcMap = new Map<string, { price: number; hsn: string; gst: number }>();
      const prodMap = new Map<string, { price: number; hsn: string; gst: number }>();
      if (names.length > 0) {
        const [{ data: svcRows }, { data: prodRows }] = await Promise.all([
          supabase.from("services").select("name, price, hsn_code, gst_percent").in("name", names),
          supabase.from("pharma_products").select("name, selling_price, hsn_code, gst_percent").in("name", names),
        ]);
        (svcRows || []).forEach((r: any) => svcMap.set(r.name, {
          price: Number(r.price) || 0, hsn: r.hsn_code || "9993", gst: Number(r.gst_percent) || 0,
        }));
        (prodRows || []).forEach((r: any) => prodMap.set(r.name, {
          price: Number(r.selling_price) || 0, hsn: r.hsn_code || "", gst: Number(r.gst_percent) || 0,
        }));
      }
      return parsed.map((p) => {
        const svc = svcMap.get(p.name);
        const prod = prodMap.get(p.name);
        const ref = svc || prod || { price: 0, hsn: "", gst: 0 };
        return makeRow(p.name, p.qty, ref.price, ref.hsn || "", ref.gst || 0);
      });
    };

    // GST is applied on top of the line amount; the rate comes from the stored
    // snapshot, falling back to the Tax Master rate for the line's HSN code.
    const makeRow = (name: string, qty: number, charges: number, hsn: string, snapshotRate: number): LineRow => {
      const gross = charges * qty;
      const master = hsnMap.get(String(hsn ?? "").trim());
      const gstRate = snapshotRate || hsnRate(hsn);
      let sgst: number, cgst: number, igst: number;
      if (master && master.total > 0 && !snapshotRate) {
        sgst = master.sgst; cgst = master.cgst; igst = master.igst;
      } else if (sameState) {
        sgst = gstRate / 2; cgst = gstRate / 2; igst = 0;
      } else {
        sgst = 0; cgst = 0; igst = gstRate;
      }
      const rate = sgst + cgst + igst;
      return { name: String(name || ""), qty, charges, hsn: hsn || "", sgst, cgst, igst, taxAmount: gross * rate / 100, amount: gross };
    };

    if (Array.isArray(inv.line_items) && inv.line_items.length > 0) {
      lineItems = (inv.line_items as any[]).map((it: any) =>
        makeRow(resolveItemName(it.name), Number(it.qty) || 1, Number(it.price) || 0, it.hsn || "", Number(it.gst) || 0),
      );

    } else {
      // Legacy fallback for invoices created before line_items existed.
      const rawServices: string[] = Array.isArray(inv.services) ? inv.services : [];
      const parsed = rawServices.map((s) => {
        const str = String(s).trim();
        const m = str.match(/^(.*?)\s+x(\d+(?:\.\d+)?)$/i);
        if (m) return { name: resolveItemName(m[1]), qty: Number(m[2]) || 1 };
        return { name: resolveItemName(str), qty: 1 };
      });
      lineItems = await buildFromRefs(parsed);
    }

    // If we somehow have zero charges across all rows (e.g. a Salesforce-
    // imported service name with no match in services/pharma_products) but
    // the invoice carries a total, synthesize charges from the invoice's own
    // GST rate via makeRow (same sgst/cgst/igst split every other row uses).
    // total_amount is tax-INCLUSIVE, so the pre-tax base must come from the
    // rate algebraically (base * (1+rate/100) = total) - subtracting a
    // separately-tracked tax amount and then re-applying the rate on top of
    // that (unreduced) base would double-count the tax and inflate the
    // printed total past what was actually billed.
    const sumCharges = lineItems.reduce((s, r) => s + r.amount, 0);
    const invTotal = Number(inv.total_amount) || 0;
    if (sumCharges === 0 && invTotal > 0 && lineItems.length > 0) {
      const gstRate = Number(inv.tax_rate) || 0;
      const base = gstRate > 0 ? invTotal / (1 + gstRate / 100) : invTotal;
      const per = base / lineItems.length;
      lineItems = lineItems.map((r) => makeRow(r.name, r.qty, per / (r.qty || 1), r.hsn, gstRate));
    }

    // ---- PDF ----
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]); // A4 portrait
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const dark = rgb(0.05, 0.05, 0.05);
    const grey = rgb(0.45, 0.45, 0.45);
    const line = rgb(0, 0, 0);

    let y = height - 40;

    // Logo
    let logoH = 0;
    try {
      const logoUrl = clinic?.logo_url;
      if (logoUrl) {
        const res = await fetch(logoUrl);
        if (res.ok) {
          const buf = new Uint8Array(await res.arrayBuffer());
          const ct = (res.headers.get("content-type") || "").toLowerCase();
          let img;
          if (ct.includes("png") || logoUrl.toLowerCase().endsWith(".png")) {
            img = await pdfDoc.embedPng(buf);
          } else {
            img = await pdfDoc.embedJpg(buf);
          }
          const targetH = 60;
          const scale = targetH / img.height;
          const w = img.width * scale;
          page.drawImage(img, { x: 40, y: y - targetH, width: w, height: targetH });
          logoH = targetH;
        }
      }
    } catch (e) {
      console.warn("logo embed failed", e);
    }
    // Start the header block below the logo (or tight to the top when absent).
    y -= logoH > 0 ? logoH + 22 : 30;

    // Header info — two columns
    const leftX = 40;
    const rightX = 320;
    const labelSize = 10;
    const lineH = 14;

    const patientFullName = `${patient?.first_name || ""} ${patient?.last_name || ""}`.trim() || inv.patient_name || "Walk-in Patient";
    const age = ageFromDob(patient?.date_of_birth);
    const sex = patient?.gender || "";
    const phone = patient?.phone || "";
    const dateStr = fmtDateIST(inv.created_at);
    const patientShort = shortPatientId(patient?.id || inv.patient_id);
    const billingId = inv.invoice_number || "";
    const gstNo = clinic?.gst_number || "";

    const drawRow = (label: string, value: string, lx: number, ly: number) => {
      page.drawText(sanitize(`${label}: `), { x: lx, y: ly, size: labelSize, font, color: dark });
      const lw = font.widthOfTextAtSize(sanitize(`${label}: `), labelSize);
      page.drawText(sanitize(String(value || "")), { x: lx + lw, y: ly, size: labelSize, font, color: dark });
    };

    drawRow("Patient Name", patientFullName, leftX, y);
    drawRow("Patient ID", patientShort, rightX, y);
    y -= lineH;
    drawRow("Age/Sex", `${age}/${sex}`, leftX, y);
    drawRow("Billing ID", billingId, rightX, y);
    y -= lineH;
    drawRow("Mobile Number", phone, leftX, y);
    drawRow("Dr/Ref.By", doctorName, rightX, y);
    y -= lineH;
    drawRow("Date", dateStr, leftX, y);
    drawRow("GST No", gstNo, rightX, y);
    y -= lineH * 2;

    page.drawText(sanitize("Billing Line Items:"), { x: leftX, y, size: 10, font, color: dark });
    y -= 14;

    // Table
    const tableX = 40;
    const tableW = width - 80; // 515
    // Column widths summing to 515
    const cols = [
      { key: "sl", title: "Sl.No", w: 32 },
      { key: "name", title: "Particulars", w: 120 },
      { key: "charges", title: "Charges (Rs)", w: 75 },
      { key: "hsn", title: "HSN", w: 38 },
      { key: "sgst", title: "SGST %", w: 38 },
      { key: "cgst", title: "CGST %", w: 38 },
      { key: "gst", title: "GST %", w: 35 },
      { key: "qty", title: "Qty", w: 28 },
      { key: "tax", title: "Tax (Rs)", w: 50 },
      { key: "amt", title: "Amount (Rs)", w: 61 },
    ];
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    if (totalW !== tableW) {
      // Adjust last column to fit exactly
      cols[cols.length - 1].w += (tableW - totalW);
    }

    const headerH = 26;
    const rowH = 22;

    // Draw header row
    const drawCellBox = (x: number, yy: number, w: number, h: number) => {
      page.drawRectangle({ x, y: yy - h, width: w, height: h, borderColor: line, borderWidth: 0.7 });
    };
    let cx = tableX;
    for (const c of cols) {
      drawCellBox(cx, y, c.w, headerH);
      // header text - centered, may wrap on 2 lines
      const tw = bold.widthOfTextAtSize(sanitize(c.title), 8);
      if (tw > c.w - 4) {
        // split
        const parts = c.title.split(" ");
        let l1 = parts.slice(0, Math.ceil(parts.length / 2)).join(" ");
        let l2 = parts.slice(Math.ceil(parts.length / 2)).join(" ");
        const w1 = bold.widthOfTextAtSize(sanitize(l1), 8);
        const w2 = bold.widthOfTextAtSize(sanitize(l2), 8);
        page.drawText(sanitize(l1), { x: cx + (c.w - w1) / 2, y: y - 10, size: 8, font: bold, color: dark });
        page.drawText(sanitize(l2), { x: cx + (c.w - w2) / 2, y: y - 20, size: 8, font: bold, color: dark });
      } else {
        page.drawText(sanitize(c.title), { x: cx + (c.w - tw) / 2, y: y - 16, size: 8, font: bold, color: dark });
      }
      cx += c.w;
    }
    y -= headerH;

    // Wrap a string into as many lines as fit the given width.
    const wrapLines = (text: string, maxW: number, size: number): string[] => {
      const words = String(text).split(/\s+/).filter(Boolean);
      const out: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(sanitize(test), size) <= maxW) {
          cur = test;
        } else {
          if (cur) out.push(cur);
          // Hard-split words longer than the column.
          let long = w;
          while (font.widthOfTextAtSize(sanitize(long), size) > maxW && long.length > 1) {
            let cut = long.length;
            while (cut > 1 && font.widthOfTextAtSize(sanitize(long.slice(0, cut)), size) > maxW) cut--;
            out.push(long.slice(0, cut));
            long = long.slice(cut);
          }
          cur = long;
        }
      }
      if (cur) out.push(cur);
      return out.length ? out : [""];
    };

    // Item rows (particulars wrap onto extra lines instead of being truncated)
    lineItems.forEach((it, i) => {
      cx = tableX;
      const sz = 8;
      const nameLines = wrapLines(it.name, cols[1].w - 6, sz);
      const thisRowH = Math.max(rowH, 8 + nameLines.length * 11);
      const cells = [
        String(i + 1),
        it.name,
        fmtINR(it.charges),
        it.hsn || "",
        pct(it.sgst),
        pct(it.cgst),
        pct(it.igst || (it.sgst + it.cgst)),
        String(it.qty),
        Number(it.taxAmount).toFixed(2),
        fmtINR(it.amount),
      ];
      for (let k = 0; k < cols.length; k++) {
        const c = cols[k];
        drawCellBox(cx, y, c.w, thisRowH);
        if (k === 1) {
          let ly = y - 14;
          for (const l of nameLines) {
            page.drawText(sanitize(l), { x: cx + 3, y: ly, size: sz, font, color: dark });
            ly -= 11;
          }
        } else {
          const display = String(cells[k] ?? "");
          const tw = font.widthOfTextAtSize(sanitize(display), sz);
          page.drawText(sanitize(display), { x: cx + (c.w - tw) / 2, y: y - 14, size: sz, font, color: dark });
        }
        cx += c.w;
      }
      y -= thisRowH;
    });

    // Totals rows: cols 0..6 empty, wide label cell (cols 7+8), value in col 9
    const drawTotalsRow = (label: string, value: string) => {
      cx = tableX;
      const spanW = cols.slice(0, 7).reduce((s, c) => s + c.w, 0);
      drawCellBox(cx, y, spanW, rowH);
      cx += spanW;
      // label cell (merged) — right-aligned with padding so it never touches the value
      const labelW = cols[7].w + cols[8].w;
      drawCellBox(cx, y, labelW, rowH);
      const lw = bold.widthOfTextAtSize(sanitize(label), 9);
      page.drawText(sanitize(label), { x: cx + labelW - lw - 6, y: y - 14, size: 9, font: bold, color: dark });
      cx += labelW;
      // value cell
      drawCellBox(cx, y, cols[9].w, rowH);
      const vw = font.widthOfTextAtSize(sanitize(value), 8);
      page.drawText(sanitize(value), { x: cx + (cols[9].w - vw) / 2, y: y - 14, size: 8, font, color: dark });
      y -= rowH;
    };


    const balanceDue = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
    drawTotalsRow("Total Billed", fmtINR(Number(inv.total_amount || 0)));
    drawTotalsRow("Total Paid", fmtINR(Number(inv.paid_amount || 0)));
    if (balanceDue > 0.5) {
      drawTotalsRow("Balance Due", fmtINR(balanceDue));
    }


    // Amount in words / Mode of payment rows
    const labelColW = 110;
    const valueColW = tableW - labelColW;
    const drawKVRow = (label: string, value: string, h = rowH) => {
      drawCellBox(tableX, y, labelColW, h);
      page.drawText(sanitize(label), { x: tableX + 4, y: y - 14, size: 9, font: bold, color: dark });
      drawCellBox(tableX + labelColW, y, valueColW, h);
      page.drawText(sanitize(value), { x: tableX + labelColW + 4, y: y - 14, size: 9, font, color: dark });
      y -= h;
    };

    const amountWords = numberToIndianWords(Number(inv.paid_amount || 0));
    drawKVRow("Amount in words", amountWords);

    let modeText = inv.payment_mode || "Cash";
    if (Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0) {
      modeText = inv.payment_splits.map((s: any) => `${s.mode}: ${fmtINR(Number(s.amount) || 0)}`).join("  |  ");
    }
    drawKVRow("Mode of payment", modeText);

    // Authorized signatory
    y -= 50;
    const sigText = "Authorized Signatory";
    const sw = bold.widthOfTextAtSize(sanitize(sigText), 10);
    page.drawText(sanitize(sigText), { x: width - 40 - sw, y, size: 10, font: bold, color: dark });

    // Footer
    const footerY = 80;
    page.drawText(sanitize("----------------"), {
      x: width / 2 - font.widthOfTextAtSize(sanitize("----------------"), 10) / 2,
      y: footerY + 30, size: 10, font, color: grey,
    });
    // Address line — avoid repeating the clinic name / city already in the address.
    const addrRaw = String(clinic?.address || "");
    const norm = (s: string) => s.trim().toLowerCase();
    const addrParts: string[] = [];
    if (clinic?.name && !norm(addrRaw).includes(norm(clinic.name))) addrParts.push(clinic.name);
    if (addrRaw) addrParts.push(addrRaw.trim());
    if (clinic?.city && !norm(addrRaw).includes(norm(clinic.city))) addrParts.push(clinic.city);
    if (clinic?.pincode) addrParts.push(String(clinic.pincode));
    const addrLine = addrParts.filter(Boolean).join(", ");
    if (addrLine) {
      const aw = font.widthOfTextAtSize(sanitize(addrLine), 9);
      page.drawText(sanitize(addrLine), { x: (width - aw) / 2, y: footerY + 16, size: 9, font, color: dark });
    }
    // Website comes from clinic settings (never derived from a free e-mail domain).
    const website = String((clinic as any)?.website || "").trim();
    if (website) {
      const site = `Website: ${website.replace(/^https?:\/\//i, "")}`;
      const sw2 = font.widthOfTextAtSize(sanitize(site), 9);
      page.drawText(sanitize(site), { x: (width - sw2) / 2, y: footerY + 4, size: 9, font, color: dark });
    }
    if (clinic?.phone) {
      const ct = `For appointments and emergency care, contact us @ ${clinic.phone}`;
      const ctw = font.widthOfTextAtSize(sanitize(ct), 9);
      page.drawText(sanitize(ct), { x: (width - ctw) / 2, y: footerY - 12, size: 9, font, color: dark });
    }
    const sysLine = "System generated invoice";
    const slw = font.widthOfTextAtSize(sanitize(sysLine), 8);
    page.drawText(sanitize(sysLine), { x: (width - slw) / 2, y: footerY - 26, size: 8, font, color: grey });


    const pdfBytes = await pdfDoc.save();

    const safeNumber = String(inv.invoice_number || inv.id).replace(/[^A-Za-z0-9_-]/g, "_");
    const path = `${safeNumber}.pdf`;

    const { error: upErr } = await supabase.storage
      .from("invoices")
      .upload(path, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (upErr) {
      console.error("Upload failed:", upErr);
      return null;
    }

    const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
    const url = pub.publicUrl;
    return { url, path };
}
