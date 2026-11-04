import { describe, it, expect } from "vitest";
import {
  isPageSortedColumn,
  sortAppointmentsByPageColumn,
  type InvoiceFacts,
} from "./appointmentSort";

const rows = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];

/** Mirrors the per-page invoice map the Bill Amount cell renders from. */
const lookup = (map: Record<string, InvoiceFacts>) => (id: string) => map[id];

const invoices = lookup({
  a: { total_amount: 13282.5, payment_mode: "UPI" },
  b: { total_amount: 500, payment_mode: "Card" },
  c: { total_amount: 21375, payment_mode: "UPI" },
  // d has no invoice at all - the "No bill" rows on the real list.
});

const ids = (result: { id: string }[]) => result.map((r) => r.id);

describe("sortAppointmentsByPageColumn - bill", () => {
  it("orders by amount ascending, cheapest first", () => {
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "asc", invoices))).toEqual(["b", "a", "c", "d"]);
  });

  it("reverses on the second click", () => {
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "desc", invoices))).toEqual(["c", "a", "b", "d"]);
  });

  it("keeps unbilled visits last in both directions", () => {
    // Ascending by bill asks "who paid least"; a visit with no bill is not the
    // answer, so it must not head the list.
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "asc", invoices)).at(-1)).toBe("d");
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "desc", invoices)).at(-1)).toBe("d");
  });

  it("leaves equal amounts in the order the server sent them", () => {
    // The server order is appointment time, so equal bills still read down the
    // day rather than shuffling.
    const same = lookup({
      a: { total_amount: 500 },
      b: { total_amount: 500 },
      c: { total_amount: 500 },
      d: { total_amount: 500 },
    });
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "asc", same))).toEqual(["a", "b", "c", "d"]);
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "desc", same))).toEqual(["a", "b", "c", "d"]);
  });

  it("treats an unreadable amount as no bill", () => {
    const messy = lookup({ a: { total_amount: null }, b: { total_amount: "not a number" }, c: { total_amount: "750" } });
    expect(ids(sortAppointmentsByPageColumn(rows, "bill", "asc", messy))[0]).toBe("c");
  });
});

describe("sortAppointmentsByPageColumn - payment mode", () => {
  it("orders alphabetically and reverses", () => {
    expect(ids(sortAppointmentsByPageColumn(rows, "payment_mode", "asc", invoices))).toEqual(["b", "a", "c", "d"]);
    expect(ids(sortAppointmentsByPageColumn(rows, "payment_mode", "desc", invoices))).toEqual(["a", "c", "b", "d"]);
  });

  it("ignores case, so Cash and cash sit together", () => {
    const mixed = lookup({
      a: { payment_mode: "cash" },
      b: { payment_mode: "Card" },
      c: { payment_mode: "CASH" },
    });
    expect(ids(sortAppointmentsByPageColumn(rows, "payment_mode", "asc", mixed))).toEqual(["b", "a", "c", "d"]);
  });

  it("keeps rows with no mode recorded last", () => {
    expect(ids(sortAppointmentsByPageColumn(rows, "payment_mode", "asc", invoices)).at(-1)).toBe("d");
    expect(ids(sortAppointmentsByPageColumn(rows, "payment_mode", "desc", invoices)).at(-1)).toBe("d");
  });
});

describe("sortAppointmentsByPageColumn", () => {
  it("does not mutate the rows it was given", () => {
    const original = [...rows];
    sortAppointmentsByPageColumn(rows, "bill", "desc", invoices);
    expect(rows).toEqual(original);
  });
});

describe("isPageSortedColumn", () => {
  it("claims only the two columns the server cannot order by", () => {
    expect(isPageSortedColumn("bill")).toBe(true);
    expect(isPageSortedColumn("payment_mode")).toBe(true);
    expect(isPageSortedColumn("start_time")).toBe(false);
    expect(isPageSortedColumn("patient")).toBe(false);
  });
});
