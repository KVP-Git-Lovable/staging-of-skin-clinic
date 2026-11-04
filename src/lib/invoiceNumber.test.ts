import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
// The real supabase.rpc reads `this` internally, so a detached reference throws
// "Cannot read properties of undefined (reading 'rest')" - which is exactly what
// broke every bill save. The first version of this mock was a standalone arrow
// function, so it could not fail that way and the bug sailed through. This mock
// reads `this` like the real client does.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rest: "present",
    rpc(this: { rest?: string } | undefined, ...args: unknown[]) {
      if (!this?.rest) {
        throw new TypeError("Cannot read properties of undefined (reading 'rest')");
      }
      return rpc(...args);
    },
  },
}));

const { allocateInvoiceNumber, allocateInvoiceNumbers } = await import("./invoiceNumber");

/**
 * The clinic's bill numbers continue the Salesforce series (B-49053 → INV-49054)
 * and have to stand up to an audit, so the one behaviour that matters here is
 * that a number is never invented locally. The old code did exactly that -
 * Date.now() mod a million - and it repeated several times a day.
 */
describe("allocateInvoiceNumbers", () => {
  beforeEach(() => rpc.mockReset());

  it("asks the database for as many numbers as there are invoices", async () => {
    rpc.mockResolvedValue({ data: ["INV-49104", "INV-49105", "INV-49106"], error: null });
    expect(await allocateInvoiceNumbers(3)).toEqual(["INV-49104", "INV-49105", "INV-49106"]);
    expect(rpc).toHaveBeenCalledWith("next_invoice_numbers", { _count: 3 });
  });

  it("reads the row-object shape too, which is how a set of text can come back", async () => {
    rpc.mockResolvedValue({
      data: [{ next_invoice_numbers: "INV-49104" }, { next_invoice_numbers: "INV-49105" }],
      error: null,
    });
    expect(await allocateInvoiceNumbers(2)).toEqual(["INV-49104", "INV-49105"]);
  });

  it("keeps the order it was given, because that order is the series", async () => {
    rpc.mockResolvedValue({ data: ["INV-49104", "INV-49105"], error: null });
    expect(await allocateInvoiceNumbers(2)).toEqual(["INV-49104", "INV-49105"]);
  });

  it("throws rather than inventing a number when the database cannot be reached", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(allocateInvoiceNumbers(1)).rejects.toThrow(/network down/);
  });

  it("throws when fewer numbers come back than invoices need", async () => {
    rpc.mockResolvedValue({ data: ["INV-49104"], error: null });
    await expect(allocateInvoiceNumbers(3)).rejects.toThrow(/asked for 3, got 1/);
  });

  it("never asks for less than one", async () => {
    rpc.mockResolvedValue({ data: ["INV-49104"], error: null });
    await allocateInvoiceNumbers(0);
    expect(rpc).toHaveBeenCalledWith("next_invoice_numbers", { _count: 1 });
  });

  it("allocateInvoiceNumber returns the single number", async () => {
    rpc.mockResolvedValue({ data: ["INV-49104"], error: null });
    expect(await allocateInvoiceNumber()).toBe("INV-49104");
  });
});
