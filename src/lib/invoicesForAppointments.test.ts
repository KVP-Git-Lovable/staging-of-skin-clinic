import { describe, it, expect } from "vitest";
import {
  chunkIds,
  fetchInvoicesByAppointmentIds,
  invoiceMapByAppointment,
} from "./invoicesForAppointments";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `appt-${i}`);

describe("chunkIds", () => {
  it("splits into chunks small enough to go in a URL", () => {
    expect(chunkIds(ids(320)).map((c) => c.length)).toEqual([150, 150, 20]);
  });

  it("drops duplicates and blanks so a chunk is never wasted", () => {
    expect(chunkIds(["a", "a", "", "b", null as unknown as string])).toEqual([["a", "b"]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunkIds([])).toEqual([]);
  });
});

describe("fetchInvoicesByAppointmentIds", () => {
  it("does not call the server at all when there is nothing to look up", async () => {
    let calls = 0;
    const out = await fetchInvoicesByAppointmentIds(async () => { calls++; return []; }, []);
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("asks only for the ids given - never the whole invoices table", async () => {
    const asked: string[] = [];
    await fetchInvoicesByAppointmentIds(
      async (chunk) => { asked.push(...chunk); return []; },
      ["a", "b", "c"],
    );
    expect(asked.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns every chunk's rows, in chunk order", async () => {
    const out = await fetchInvoicesByAppointmentIds(
      async (chunk) => chunk.map((id) => ({ appointment_id: id })),
      ids(400),
      { chunkSize: 2, concurrency: 3 },
    );
    expect(out).toHaveLength(400);
    expect(out.map((r) => r.appointment_id)).toEqual(ids(400));
  });

  it("keeps at most `concurrency` requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    await fetchInvoicesByAppointmentIds(
      async (chunk) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        return chunk.map((id) => ({ appointment_id: id }));
      },
      ids(40),
      { chunkSize: 1, concurrency: 4 },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("propagates a failure instead of quietly returning a short list", async () => {
    // A swallowed error is what rendered a whole column of dashes.
    await expect(
      fetchInvoicesByAppointmentIds(async () => { throw new Error("statement timeout"); }, ids(5)),
    ).rejects.toThrow("statement timeout");
  });
});

describe("invoiceMapByAppointment", () => {
  it("keys invoices by their appointment", () => {
    const map = invoiceMapByAppointment([
      { appointment_id: "a", total_amount: 850 },
      { appointment_id: "b", total_amount: 4500 },
    ]);
    expect(map.get("a")?.total_amount).toBe(850);
    expect(map.get("b")?.total_amount).toBe(4500);
  });

  it("skips unattached invoices rather than keying them under null", () => {
    const map = invoiceMapByAppointment([
      { appointment_id: null, total_amount: 100 },
      { appointment_id: undefined, total_amount: 200 },
    ]);
    expect(map.size).toBe(0);
  });

  // Aneesh Kumar, 2 October: ₹850 cancelled as an incorrect amount at 12:00 and
  // replaced by ₹2,500 nine minutes later. The row showed the ₹850.
  it("leaves a cancelled bill out, and shows the one that replaced it", () => {
    const map = invoiceMapByAppointment([
      {
        appointment_id: "a",
        total_amount: 850,
        status: "Cancelled",
        payment_mode: "UPI",
        created_at: "2026-10-02T10:12:41Z",
      },
      {
        appointment_id: "a",
        total_amount: 2500,
        status: "Paid",
        payment_mode: "UPI",
        created_at: "2026-10-02T12:09:20Z",
      },
    ]);
    expect(map.get("a")?.total_amount).toBe(2500);
    expect(map.get("a")?.bills).toHaveLength(1);
  });

  it("reads as no bill at all when the only one was cancelled", () => {
    const map = invoiceMapByAppointment([{ appointment_id: "a", total_amount: 850, status: "Cancelled" }]);
    expect(map.has("a")).toBe(false);
  });

  it("ignores an installment folded into a merged payment", () => {
    const map = invoiceMapByAppointment([
      { appointment_id: "a", total_amount: 1000, status: "Merged" },
      { appointment_id: "a", total_amount: 3000, status: "Paid" },
    ]);
    expect(map.get("a")?.total_amount).toBe(3000);
  });

  // Shruthi, 12 September: the consultation billed apart from the treatment.
  // Whichever row arrived last used to win, so the visit read ₹1,250 or ₹18,000.
  it("keeps both of a visit's bills, and totals them", () => {
    const map = invoiceMapByAppointment([
      {
        id: "B-48692",
        appointment_id: "a",
        total_amount: 1250,
        paid_amount: 1250,
        status: "Paid",
        payment_mode: "Google Pay",
        created_at: "2026-09-12T06:00:00Z",
      },
      {
        id: "B-48695",
        appointment_id: "a",
        total_amount: 18000,
        paid_amount: 18000,
        status: "Paid",
        payment_mode: "Google Pay",
        created_at: "2026-09-12T07:30:00Z",
      },
    ]);
    const visit = map.get("a");
    expect(visit?.total_amount).toBe(19250);
    expect(visit?.paid_amount).toBe(19250);
    expect(visit?.bills.map((b) => b.id)).toEqual(["B-48695", "B-48692"]);
  });

  it("names one payment mode when the bills agree and each when they do not", () => {
    const base = { appointment_id: "a", total_amount: 100, status: "Paid" };
    expect(
      invoiceMapByAppointment([
        { ...base, payment_mode: "Google Pay", created_at: "2026-09-14T06:00:00Z" },
        { ...base, payment_mode: "Google Pay", created_at: "2026-09-14T07:00:00Z" },
      ]).get("a")?.payment_mode,
    ).toBe("Google Pay");
    expect(
      invoiceMapByAppointment([
        { ...base, payment_mode: "Google Pay", created_at: "2026-09-14T06:00:00Z" },
        { ...base, payment_mode: "Credit Card", created_at: "2026-09-14T07:00:00Z" },
      ]).get("a")?.payment_mode,
    ).toBe("Credit Card, Google Pay");
  });

  it("gives a single bill its own one-item list, so the cell has one rule", () => {
    const map = invoiceMapByAppointment([{ id: "x", appointment_id: "a", total_amount: 850, status: "Paid" }]);
    expect(map.get("a")?.bills).toHaveLength(1);
    expect(map.get("a")?.total_amount).toBe(850);
  });
});
