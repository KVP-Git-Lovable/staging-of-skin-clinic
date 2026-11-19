import { describe, expect, it } from "vitest";
import { canSendInvoiceToZoho } from "./zohoPush";

describe("canSendInvoiceToZoho", () => {
  it("allows an ordinary unsynced invoice", () => {
    expect(canSendInvoiceToZoho({ zoho_invoice_id: null, cancelled_at: null, merged_into_invoice_id: null, status: "Pending" })).toBe(true);
  });
  it("never sends an invoice already in Zoho Books", () => {
    expect(canSendInvoiceToZoho({ zoho_invoice_id: "4277102000000040002" })).toBe(false);
  });
  it("never sends a cancelled invoice", () => {
    expect(canSendInvoiceToZoho({ cancelled_at: "2026-11-19T10:00:00Z" })).toBe(false);
    expect(canSendInvoiceToZoho({ status: "Cancelled" })).toBe(false);
  });
  it("never sends a merged invoice", () => {
    expect(canSendInvoiceToZoho({ merged_into_invoice_id: "1d3b0a8e-0000-0000-0000-000000000000" })).toBe(false);
  });
});
