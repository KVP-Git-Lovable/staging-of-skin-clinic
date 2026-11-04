import { describe, it, expect, vi } from "vitest";
import { isFreshPdf, waitForInvoicePdf } from "./invoicePdfWait";

const ASKED = new Date("2026-10-03T07:48:00Z");
const URL = "https://example.test/storage/invoices/INV-49310.pdf";
const noSleep = () => Promise.resolve();

describe("isFreshPdf", () => {
  it("accepts a PDF written after the request", () => {
    expect(isFreshPdf({ pdf_url: URL, updated_at: "2026-10-03T07:49:30Z" }, ASKED)).toBe(true);
  });

  it("refuses one written before it, which could predate an edit", () => {
    expect(isFreshPdf({ pdf_url: URL, updated_at: "2026-10-03T07:40:00Z" }, ASKED)).toBe(false);
  });

  it("refuses a row with no PDF at all - INV-49310's case", () => {
    expect(isFreshPdf({ pdf_url: null, updated_at: "2026-10-03T07:50:22Z" }, ASKED)).toBe(false);
    expect(isFreshPdf(null, ASKED)).toBe(false);
  });

  it("refuses a row whose timestamp cannot be read", () => {
    expect(isFreshPdf({ pdf_url: URL, updated_at: null }, ASKED)).toBe(false);
    expect(isFreshPdf({ pdf_url: URL, updated_at: "not a date" }, ASKED)).toBe(false);
  });
});

describe("waitForInvoicePdf", () => {
  it("returns the PDF the generator wrote while the call was giving up", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({ pdf_url: null, updated_at: "2026-10-03T07:48:10Z" })
      .mockResolvedValueOnce({ pdf_url: URL, updated_at: "2026-10-03T07:49:40Z" });
    await expect(
      waitForInvoicePdf({ read, askedAt: ASKED, sleep: noSleep, now: () => ASKED.getTime() }),
    ).resolves.toBe(URL);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("asks once when the PDF is already there", async () => {
    const read = vi.fn().mockResolvedValue({ pdf_url: URL, updated_at: "2026-10-03T07:48:30Z" });
    await expect(
      waitForInvoicePdf({ read, askedAt: ASKED, sleep: noSleep, now: () => ASKED.getTime() }),
    ).resolves.toBe(URL);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("gives up rather than waiting on a generator that is minutes away", async () => {
    const read = vi.fn().mockResolvedValue({ pdf_url: null, updated_at: null });
    let clock = ASKED.getTime();
    await expect(
      waitForInvoicePdf({
        read,
        askedAt: ASKED,
        timeoutMs: 9_000,
        intervalMs: 3_000,
        sleep: async () => { clock += 3_000; },
        now: () => clock,
      }),
    ).resolves.toBeNull();
    expect(read).toHaveBeenCalled();
  });

  it("keeps waiting when a read itself fails", async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ pdf_url: URL, updated_at: "2026-10-03T07:49:00Z" });
    await expect(
      waitForInvoicePdf({ read, askedAt: ASKED, sleep: noSleep, now: () => ASKED.getTime() }),
    ).resolves.toBe(URL);
  });

  it("never returns a stale PDF, however long it waits", async () => {
    const read = vi.fn().mockResolvedValue({ pdf_url: URL, updated_at: "2026-10-03T07:00:00Z" });
    let clock = ASKED.getTime();
    await expect(
      waitForInvoicePdf({
        read,
        askedAt: ASKED,
        timeoutMs: 6_000,
        intervalMs: 3_000,
        sleep: async () => { clock += 3_000; },
        now: () => clock,
      }),
    ).resolves.toBeNull();
  });
});
