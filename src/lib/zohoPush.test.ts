import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.fn();
let stored: Record<string, string | null> | null = null;
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }) }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) }, from: (...a: unknown[]) => (from as any)(...a) },
}));

import { canSendInvoiceToZoho, invokeZohoPush, isZohoPushInFlight } from "./zohoPush";

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

describe("invokeZohoPush", () => {
  beforeEach(() => { invoke.mockReset(); stored = null; });

  it("does not ask the server again when the invoice is already in Zoho, even if the list is out of date", async () => {
    stored = { zoho_invoice_id: "4277102000000044022", zoho_invoice_synced_at: "2026-11-19T11:36:15.69+00:00" };
    await expect(invokeZohoPush("zoho-push-invoice", { invoiceId: "inv-3" })).resolves.toMatchObject({
      zoho_invoice_id: "4277102000000044022",
      already_synced: true,
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends an invoice only once when the automatic push and a button click overlap", async () => {
    let finish!: (v: unknown) => void;
    invoke.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    const auto = invokeZohoPush("zoho-push-invoice", { invoiceId: "inv-1" });
    expect(isZohoPushInFlight("zoho-push-invoice", "inv-1")).toBe(true);
    const click = invokeZohoPush("zoho-push-invoice", { invoiceId: "inv-1" });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    finish({ data: { zoho_invoice_id: "Z1", zoho_invoice_synced_at: "2026-11-19T11:36:15Z" }, error: null });
    await expect(auto).resolves.toMatchObject({ zoho_invoice_id: "Z1" });
    await expect(click).resolves.toMatchObject({ zoho_invoice_id: "Z1" });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(isZohoPushInFlight("zoho-push-invoice", "inv-1")).toBe(false);
  });

  it("treats 'already in Zoho Books' as synced, not as an error", async () => {
    const body = { error: "This invoice is already in Zoho Books", zoho_invoice_id: "4277102000000044022", zoho_invoice_synced_at: "2026-11-19T11:36:15.69+00:00" };
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status: 409 })) });
    await expect(invokeZohoPush("zoho-push-invoice", { invoiceId: "inv-2" })).resolves.toEqual({
      zoho_invoice_id: "4277102000000044022",
      zoho_invoice_synced_at: "2026-11-19T11:36:15.69+00:00",
      already_synced: true,
    });
  });

  it("still shows Zoho's own refusal message", async () => {
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: "Please enter valid expense account" }), { status: 400 })) });
    await expect(invokeZohoPush("zoho-push-expense", { expenseId: "e-1" })).rejects.toThrow("Please enter valid expense account");
  });
});
