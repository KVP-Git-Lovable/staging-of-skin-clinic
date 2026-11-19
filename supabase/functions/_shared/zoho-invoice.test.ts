import { assertEquals } from "jsr:@std/assert@1";
import { buildZohoInvoiceBody, buildZohoPaymentBody, clinicDate, zohoInvoiceBlocker, zohoPaymentMode, type InvoiceForZoho } from "./zoho-invoice.ts";

const base: InvoiceForZoho = {
  invoice_number: "INV-1042",
  created_at: "2026-11-19T20:00:00Z", // 01:30 on 20 Nov in India
  due_date: null,
  total_amount: 1180,
  paid_amount: 0,
  tax_amount: 180,
  line_items: [{ kind: "service", name: "Peel", qty: 1, price: 1000, gst: 18 }],
  payment_mode: "Cash",
};

Deno.test("cancelled invoices are never sent", () => {
  assertEquals(zohoInvoiceBlocker({ cancelled_at: "2026-11-19T10:00:00Z" }) !== null, true);
  assertEquals(zohoInvoiceBlocker({ status: "Cancelled" }) !== null, true);
});

Deno.test("merged invoices are never sent", () => {
  assertEquals(zohoInvoiceBlocker({ merged_into_invoice_id: "1d3b0a8e-0000-0000-0000-000000000000" }) !== null, true);
});

Deno.test("an invoice already in Zoho Books is never sent again", () => {
  assertEquals(zohoInvoiceBlocker({ zoho_invoice_id: "4277102000000040002" }), "This invoice is already in Zoho Books");
});

Deno.test("an ordinary unsynced invoice may be sent", () => {
  assertEquals(zohoInvoiceBlocker({ cancelled_at: null, merged_into_invoice_id: null, status: "Pending", zoho_invoice_id: null }), null);
});

Deno.test("invoice number is the reference, due date passes through", () => {
  const body = buildZohoInvoiceBody({ ...base, due_date: "2026-12-19" }, "C1");
  assertEquals(body.reference_number, "INV-1042");
  assertEquals(body.due_date, "2026-12-19");
  assertEquals(body.customer_id, "C1");
});

Deno.test("invoice date is the clinic's (India) date", () => {
  assertEquals(clinicDate(base.created_at), "2026-11-20");
});

Deno.test("line items carry name, rate and quantity", () => {
  const body = buildZohoInvoiceBody(
    { ...base, line_items: [{ name: "Peel", qty: 1, price: 1000 }, { name: "Serum", qty: 2, price: 250 }], total_amount: 1500, tax_amount: 0 },
    "C1",
  );
  assertEquals(body.line_items, [{ name: "Peel", rate: 1000, quantity: 1 }, { name: "Serum", rate: 250, quantity: 2 }]);
  assertEquals(body.adjustment, undefined);
});

Deno.test("Zoho total equals total_amount: GST goes in as the adjustment", () => {
  const body = buildZohoInvoiceBody(base, "C1");
  assertEquals(body.adjustment, 180);
  assertEquals(body.adjustment_description, "GST");
});

Deno.test("a stage of a plan keeps its own total, not the whole plan's", () => {
  const body = buildZohoInvoiceBody({ ...base, total_amount: 590, tax_amount: 90 }, "C1");
  assertEquals(body.adjustment, -410);
});

Deno.test("no payment is recorded when nothing was paid", () => {
  assertEquals(buildZohoPaymentBody(base, "C1", "Z1"), null);
});

Deno.test("paid amount is recorded against the Zoho invoice", () => {
  const p = buildZohoPaymentBody({ ...base, paid_amount: 500 }, "C1", "Z1")!;
  assertEquals(p.amount, 500);
  assertEquals(p.invoices, [{ invoice_id: "Z1", amount_applied: 500 }]);
  assertEquals(p.customer_id, "C1");
});

Deno.test("payment never exceeds the invoice total", () => {
  assertEquals(buildZohoPaymentBody({ ...base, paid_amount: 2000 }, "C1", "Z1")!.amount, 1180);
});

Deno.test("clinic payment modes map to Zoho's", () => {
  assertEquals(zohoPaymentMode("Cash"), "cash");
  assertEquals(zohoPaymentMode("Card"), "creditcard");
  assertEquals(zohoPaymentMode("Cheque"), "check");
  assertEquals(zohoPaymentMode("Bank Transfer"), "banktransfer");
  assertEquals(zohoPaymentMode("UPI"), "others");
});
