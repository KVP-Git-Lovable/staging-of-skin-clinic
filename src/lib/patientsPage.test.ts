import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The header on the Patients list said "32358 items" over a table holding
 * 27,254 patients, and ~27,254 the moment you opened any saved view. The number
 * was never counted: the page asked PostgREST for `count: "planned"`, which
 * answers from Postgres's table statistics. These tests hold the count to being
 * a count.
 */

interface Response {
  data: Array<Record<string, unknown>>;
  count: number | null;
  error?: { message: string };
}

interface Call {
  selectOptions: unknown;
  ilike: Array<[string, string]>;
  or: string[];
  orders: Array<[string, unknown]>;
  range?: [number, number];
  limit?: number;
}

const calls: Call[] = [];
let responses: Response[] = [];

// The Supabase client is a module singleton, so it has to be stubbed before the
// module under test imports it.
vi.mock("@/integrations/supabase/client", () => {
  const nextResponse = (): Response =>
    responses[calls.length - 1] ?? { data: [], count: 0 };

  const makeQuery = () => {
    const record: Call = { selectOptions: undefined, ilike: [], or: [], orders: [] };
    calls.push(record);
    const q: Record<string, unknown> = {
      select: (_cols: string, opts?: unknown) => {
        record.selectOptions = opts;
        return q;
      },
      order: (col: string, opts?: unknown) => {
        record.orders.push([col, opts]);
        return q;
      },
      ilike: (col: string, value: string) => {
        record.ilike.push([col, value]);
        return q;
      },
      or: (filter: string) => {
        record.or.push(filter);
        return q;
      },
      range: (from: number, to: number) => {
        record.range = [from, to];
        const r = nextResponse();
        return Promise.resolve(r.error ? { data: null, count: null, error: r.error } : { ...r, error: null });
      },
      limit: (n: number) => {
        record.limit = n;
        const r = nextResponse();
        return Promise.resolve(r.error ? { data: null, count: null, error: r.error } : { ...r, error: null });
      },
    };
    return q;
  };
  return { supabase: { from: () => makeQuery() } };
});

const { fetchPatientsPage, fetchAllPatients, PATIENTS_PAGE_SIZE } = await import("./patientsPage");

/** `n` rows of filler, so a page can be told apart from the count of matches. */
const rows = (n: number, prefix = "p") =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, first_name: "A", last_name: "B" }));

beforeEach(() => {
  calls.length = 0;
  responses = [];
});

describe("fetchPatientsPage", () => {
  it("reports the number of patients, not the number of rows on the page", async () => {
    responses = [{ data: rows(51), count: 27254 }];
    const page = await fetchPatientsPage(1, "");
    expect(page.total).toBe(27254);
    expect(page.rows).toHaveLength(PATIENTS_PAGE_SIZE);
    expect(page.hasMore).toBe(true);
  });

  it("reports the same total on page 2 as on page 1", async () => {
    // `fromIdx + visible.length` was the old total, so page 2 of the clinic's
    // list claimed there were 100 patients.
    responses = [{ data: rows(51), count: 27254 }];
    const page = await fetchPatientsPage(2, "");
    expect(page.total).toBe(27254);
    expect(calls[0].range).toEqual([50, 100]);
  });

  it("asks the database to count, never to estimate", async () => {
    responses = [{ data: rows(10), count: 10 }];
    await fetchPatientsPage(1, "");
    expect(calls.map((c) => c.selectOptions)).toEqual([{ count: "exact" }]);

    calls.length = 0;
    responses = [{ data: rows(10), count: 10 }];
    await fetchPatientsPage(1, "nisha");
    expect(calls.map((c) => c.selectOptions)).toEqual([{ count: "exact" }]);
  });

  it("tells a search how many patients it matched, not how many fit on a page", async () => {
    // Searching a common name reported "50 items" however many people matched.
    responses = [{ data: rows(51), count: 1200 }];
    const page = await fetchPatientsPage(1, "nisha");
    expect(page.total).toBe(1200);
    expect(page.rows).toHaveLength(PATIENTS_PAGE_SIZE);
  });

  it("stops at the first strategy that matches somebody", async () => {
    responses = [{ data: rows(1), count: 1 }];
    const page = await fetchPatientsPage(1, "nisha rai");
    expect(page.total).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].ilike).toEqual([
      ["first_name", "nisha"],
      ["last_name", "rai"],
    ]);
  });

  it("widens the search only when the narrower one matches nobody", async () => {
    responses = [
      { data: [], count: 0 },
      { data: [], count: 0 },
      { data: rows(3), count: 3 },
    ];
    const page = await fetchPatientsPage(1, "nisha");
    expect(page.total).toBe(3);
    expect(calls).toHaveLength(3);
    expect(calls[0].or).toEqual(["first_name.ilike.nisha,last_name.ilike.nisha"]);
    expect(calls[1].or).toEqual(["first_name.ilike.nisha%,last_name.ilike.nisha%"]);
    expect(calls[2].or).toEqual([
      "first_name.ilike.%nisha%,last_name.ilike.%nisha%,email.ilike.%nisha%,phone.ilike.%nisha%,alternate_phone.ilike.%nisha%",
    ]);
  });

  it("keeps answering page 2 of a search from the same strategy as page 1", async () => {
    // Three exact matches all sit on page 1, so from page 2 the exact strategy
    // looked like it had found nobody and the page silently fell through to the
    // wider one - page 2 of a search was not page 2 of the same list of people.
    responses = [{ data: [], count: 3 }];
    const page = await fetchPatientsPage(2, "nisha rai");
    expect(page.total).toBe(3);
    expect(page.rows).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("falls back to fuzzy ranking, and counts what it ranked", async () => {
    responses = [
      { data: [], count: 0 },
      { data: [], count: 0 },
      { data: [], count: 0 },
      {
        data: [
          { id: "a", first_name: "Nisha", last_name: "Rai", phone: "", email: "" },
          { id: "b", first_name: "Nishant", last_name: "Rao", phone: "", email: "" },
        ],
        count: null,
      },
    ];
    const page = await fetchPatientsPage(1, "nisha");
    expect(page.total).toBe(page.rows.length);
    expect(page.total).toBeGreaterThan(0);
    expect(calls[3].limit).toBe(300);
  });

  it("says which search its count answers, so a stale one can be spotted", async () => {
    responses = [{ data: rows(1), count: 1 }];
    expect((await fetchPatientsPage(1, "  nisha  ")).term).toBe("nisha");
  });

  it("treats a search of only spaces as no search at all", async () => {
    responses = [{ data: rows(10), count: 27254 }];
    const page = await fetchPatientsPage(1, "   ");
    expect(page.term).toBe("");
    expect(page.total).toBe(27254);
    expect(calls[0].ilike).toEqual([]);
    expect(calls[0].or).toEqual([]);
  });

  it("passes a database error on, so the list can say the query timed out", async () => {
    responses = [{ data: [], count: null, error: { message: "canceling statement due to statement timeout" } }];
    await expect(fetchPatientsPage(1, "")).rejects.toMatchObject({ message: /statement timeout/ });
  });

  it("knows there is no next page when the probe row does not come back", async () => {
    responses = [{ data: rows(50), count: 50 }];
    const page = await fetchPatientsPage(1, "");
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(50);
  });
});

describe("fetchAllPatients", () => {
  it("orders by id as well, so paging cannot skip or repeat a patient", async () => {
    responses = [{ data: [], count: null }];
    await fetchAllPatients("");
    expect(calls[0].orders).toEqual([
      ["last_visit_date", { ascending: false, nullsFirst: false }],
      ["id", { ascending: true }],
    ]);
  });
});
