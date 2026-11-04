import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Appointments list reported 56,530 appointments over a table holding
 * 56,776, because it asked PostgREST for `count: "planned"`/`"estimated"` -
 * Postgres's table statistics rather than a count. Any saved view counted the
 * same appointments exactly and disagreed, and printAppointments used the
 * under-reported total as a loop bound and stopped early. These hold it to a
 * real count, under every filter combination the old code branched on.
 */

interface Call {
  selectColumns: string;
  selectOptions: unknown;
  or: string[];
  range?: [number, number];
  /** Every .order() the builder received, so a sort can be asserted on. */
  orders: Array<{ column: string; options?: Record<string, unknown> }>;
}

const calls: Call[] = [];
let rowCount = 0;
let serverCount = 0;

vi.mock("@/integrations/supabase/client", () => {
  const makeQuery = () => {
    const record: Call = { selectColumns: "", selectOptions: undefined, or: [], orders: [] };
    calls.push(record);
    const q: Record<string, unknown> = {
      select: (_cols: string, opts?: unknown) => {
        record.selectColumns = _cols;
        record.selectOptions = opts;
        return q;
      },
      range: (from: number, to: number) => {
        record.range = [from, to];
        return Promise.resolve({
          data: Array.from({ length: rowCount }, (_, i) => ({ id: `a-${i}` })),
          count: serverCount,
          error: null,
        });
      },
    };
    q.or = (filter: string) => {
      record.or.push(filter);
      return q;
    };
    q.order = (column: string, options?: Record<string, unknown>) => {
      record.orders.push({ column, options });
      return q;
    };
    for (const m of ["gte", "lte", "in", "eq", "not", "is", "limit", "ilike"]) {
      q[m] = () => q;
    }
    return q;
  };
  return { supabase: { from: () => makeQuery() } };
});

const { fetchAppointmentsPage } = await import("./appointmentsPage");
import type { FetchAppointmentsPageParams } from "./appointmentsPage";

const base: FetchAppointmentsPageParams = {
  page: 1,
  pageSize: 50,
  dateRange: null,
  doctorIds: [],
  status: "all",
  visitStatus: "all",
  search: "",
  sortColumn: "start_time",
  sortDirection: "desc",
};

beforeEach(() => {
  calls.length = 0;
  rowCount = 0;
  serverCount = 0;
});

describe("fetchAppointmentsPage", () => {
  it("joins the assigned doctor rather than the therapist when both staff relationships exist", async () => {
    await fetchAppointmentsPage({ ...base, sortColumn: "doctor" });
    const appointmentQuery = calls.find((c) => c.selectOptions !== undefined);
    expect(appointmentQuery?.selectColumns).toContain("staff:staff!appointments_staff_id_fkey(first_name, last_name)");
    expect(appointmentQuery?.selectColumns).not.toContain("appointments_therapist_id_fkey");
  });

  it("counts rather than estimates, whatever is being filtered", async () => {
    const variations: Array<Partial<FetchAppointmentsPageParams>> = [
      {},
      { dateRange: { start: new Date("2026-10-01"), end: new Date("2026-10-07") } },
      { doctorIds: ["doc-1"] },
      { status: "Confirmed" },
      { visitStatus: "Completed" },
      { search: "hair" },
    ];
    for (const v of variations) {
      calls.length = 0;
      await fetchAppointmentsPage({ ...base, ...v });
      const counting = calls.filter((c) => c.selectOptions !== undefined);
      expect(counting.map((c) => c.selectOptions)).toContainEqual({ count: "exact" });
      expect(JSON.stringify(counting)).not.toMatch(/planned|estimated/);
    }
  });

  it("reports the server's count, not the size of the page", async () => {
    rowCount = 51;
    serverCount = 56776;
    const res = await fetchAppointmentsPage(base);
    expect(res.total).toBe(56776);
    expect(res.rows).toHaveLength(50);
  });

  it("still takes 'is there a next page' from the probe row", async () => {
    rowCount = 51;
    serverCount = 56776;
    expect((await fetchAppointmentsPage(base)).hasMore).toBe(true);

    rowCount = 50;
    serverCount = 56776;
    expect((await fetchAppointmentsPage(base)).hasMore).toBe(false);
  });
});

describe("searching appointments by patient name", () => {
  it("keeps searching the stored copy of the name", async () => {
    // The screens show the joined patient record now, but PostgREST cannot
    // filter top-level rows by a joined column - so the search has to keep
    // asking about appointments.patient_name. Removing it would make the
    // search box stop finding people by name altogether.
    await fetchAppointmentsPage({ ...base, search: "baazi" });
    const filters = calls.flatMap((c) => c.or).join(" ");
    expect(filters).toContain("patient_name.ilike.%baazi%");
  });
});

/**
 * Every sortable column needs a case in the switch. One that is missing does
 * not throw - it falls through to the default and silently orders by date,
 * which is what the comment above `reason_for_consultation` is there to warn
 * about. The Therapist column was added later and has to be held to it.
 */
describe("fetchAppointmentsPage - sorting", () => {
  const sortedBy = async (sortColumn: string) => {
    calls.length = 0;
    await fetchAppointmentsPage({ ...base, sortColumn, sortDirection: "asc" });
    return calls.flatMap((c) => c.orders);
  };

  it("orders the Therapist column by the stored therapist name", async () => {
    const orders = await sortedBy("therapist");
    expect(orders.map((o) => o.column)).toContain("therapist_name");
  });

  it("does NOT quietly fall back to the date for Therapist", async () => {
    // The whole failure mode: clicking the header appears to do nothing
    // because the rows come back in date order regardless.
    const orders = await sortedBy("therapist");
    expect(orders.map((o) => o.column)).not.toContain("start_time");
  });

  it("sorts on the stored name, not a join onto staff", async () => {
    // therapist_name survives a therapist leaving the clinic; the join does
    // not, so ordering on it would scatter their visits among the unassigned.
    const [order] = (await sortedBy("therapist")).filter((o) => o.column === "therapist_name");
    expect(order.options?.referencedTable).toBeUndefined();
  });

  it("leaves the Doctor column ordering by the joined staff row", async () => {
    const orders = await sortedBy("doctor");
    const doctor = orders.find((o) => o.column === "first_name");
    expect(doctor?.options?.referencedTable).toBe("staff");
  });
});
