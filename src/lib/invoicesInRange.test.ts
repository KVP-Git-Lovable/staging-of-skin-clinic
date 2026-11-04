import { describe, it, expect, vi, beforeEach } from "vitest";

// The Supabase client is a module singleton, so it has to be stubbed before the
// module under test imports it.
const calls: Array<{ gte: string[]; lte: string[]; ranges: Array<[number, number]> }> = [];
let totalRows = 0;

interface StubQuery {
  select: () => StubQuery;
  order: () => StubQuery;
  gte: (col: string) => StubQuery;
  lte: (col: string) => StubQuery;
  range: (from: number, to: number) => Promise<{ data: Array<{ id: string }>; error: null }>;
}

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const record = { gte: [] as string[], lte: [] as string[], ranges: [] as Array<[number, number]> };
    calls.push(record);
    const q: StubQuery = {
      select: () => q,
      order: () => q,
      gte: (col: string) => { record.gte.push(col); return q; },
      lte: (col: string) => { record.lte.push(col); return q; },
      range: (from: number, to: number) => {
        record.ranges.push([from, to]);
        const slice = Array.from(
          { length: Math.max(0, Math.min(to, totalRows - 1) - from + 1) },
          (_, i) => ({ id: `inv-${from + i}` }),
        );
        return Promise.resolve({ data: slice, error: null });
      },
    };
    return q;
  };
  return { supabase: { from: () => makeQuery() } };
});

const { fetchInvoicesInRange } = await import("./invoicesPage");

beforeEach(() => {
  calls.length = 0;
});

describe("fetchInvoicesInRange", () => {
  it("returns every row past the old 3,000 cap", async () => {
    // The regression this file exists for: 3,500 rows used to come back as
    // 3,000, silently, with the page reporting 3,000 as the total.
    totalRows = 3500;
    const rows = await fetchInvoicesInRange({});
    expect(rows).toHaveLength(3500);
    expect(rows[3499].id).toBe("inv-3499");
  });

  it("returns the whole table, not a third of it", async () => {
    totalRows = 29000;
    expect(await fetchInvoicesInRange({})).toHaveLength(29000);
  });

  it("pages until the server runs out rather than stopping at a fixed count", async () => {
    totalRows = 2500;
    await fetchInvoicesInRange({});
    expect(calls.flatMap((c) => c.ranges)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("bounds by created_at when a range is given - the only bound that should exist", async () => {
    totalRows = 10;
    await fetchInvoicesInRange({ dateFrom: new Date("2026-09-11"), dateTo: new Date("2026-09-11") });
    expect(calls[0].gte).toEqual(["created_at"]);
    expect(calls[0].lte).toEqual(["created_at"]);
  });

  it("applies no date bound when none is asked for", async () => {
    totalRows = 10;
    await fetchInvoicesInRange({});
    expect(calls[0].gte).toEqual([]);
    expect(calls[0].lte).toEqual([]);
  });

  it("copes with an empty table", async () => {
    totalRows = 0;
    expect(await fetchInvoicesInRange({})).toEqual([]);
  });
});
