/**
 * Sorting the appointment list on columns the server cannot order by.
 *
 * Most headers sort in Postgres, across the whole filtered set, before the page
 * is cut - see the switch in appointmentsPage.ts. Two cannot: Bill Amount and
 * Payment Mode come from an invoice lookup done *after* the rows arrive, keyed
 * on the appointment ids of the page in hand. There is no column on
 * `appointments` to order by, so those two headers used to do nothing at all
 * and said "Not sortable across pages".
 *
 * They sort the rows in hand instead. The page holds 200 appointments, so a
 * day's list is one page and this is the whole sort in everyday use; it is
 * partial only when someone spans a wide date range, which is what the header
 * tooltip says.
 *
 * A row with no bill sorts last in both directions. Ascending by bill is asking
 * "who paid least", and an unbilled visit is not the answer - it is the absence
 * of one, and burying it keeps the top of the list meaningful either way.
 */

export type SortDirection = "asc" | "desc";

/** The columns this module sorts. Everything else is the server's job. */
export const PAGE_SORTED_COLUMNS = ["bill", "payment_mode"] as const;
export type PageSortedColumn = (typeof PAGE_SORTED_COLUMNS)[number];

export function isPageSortedColumn(column: string): column is PageSortedColumn {
  return (PAGE_SORTED_COLUMNS as readonly string[]).includes(column);
}

export interface SortableAppointment {
  id: string;
  start_time?: string | null;
  status?: string | null;
}

/**
 * How to read the columns that are not plain fields on the row.
 *
 * Passed in rather than imported so this stays a pure module: the doctor's name
 * comes from a staff map the page holds, and the Investigation text has its own
 * fallback rules (investigationText).
 */
export interface AppointmentSortContext {
  invoiceFor: (id: string) => InvoiceFacts | undefined;
  patientName: (row: never) => string;
  phone: (row: never) => string;
  doctorName: (row: never) => string;
  investigation: (row: never) => string;
}

/** What the row's invoice says, or undefined when it has none. */
export interface InvoiceFacts {
  total_amount?: number | string | null;
  payment_mode?: string | null;
}

const billOf = (invoice: InvoiceFacts | undefined): number | null => {
  if (!invoice) return null;
  const n = Number(invoice.total_amount ?? NaN);
  return Number.isFinite(n) ? n : null;
};

const modeOf = (invoice: InvoiceFacts | undefined): string =>
  String(invoice?.payment_mode ?? "").trim();

/**
 * A copy of `rows`, ordered by a column the server could not order by.
 *
 * `invoiceFor` is the same per-page lookup the Bill Amount cell renders from,
 * so the order always matches what is on screen. The sort is stable: rows that
 * compare equal keep the server's order, which is the appointment time - so
 * equal bills still read down the day in clock order rather than shuffling.
 */
export function sortAppointmentsByPageColumn<T extends SortableAppointment>(
  rows: T[],
  column: PageSortedColumn,
  direction: SortDirection,
  invoiceFor: (id: string) => InvoiceFacts | undefined,
): T[] {
  const sign = direction === "asc" ? 1 : -1;

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const invA = invoiceFor(a.row.id);
      const invB = invoiceFor(b.row.id);

      if (column === "bill") {
        const x = billOf(invA);
        const y = billOf(invB);
        // Unbilled last whichever way the arrow points, so the sign is not
        // applied to this comparison.
        if (x === null && y === null) return a.index - b.index;
        if (x === null) return 1;
        if (y === null) return -1;
        if (x !== y) return (x - y) * sign;
        return a.index - b.index;
      }

      const x = modeOf(invA);
      const y = modeOf(invB);
      if (!x && !y) return a.index - b.index;
      if (!x) return 1;
      if (!y) return -1;
      const cmp = x.localeCompare(y, undefined, { sensitivity: "base" });
      return cmp !== 0 ? cmp * sign : a.index - b.index;
    })
    .map(({ row }) => row);
}


/** Text comparison that puts blanks last, whichever way the arrow points. */
function compareText(x: string, y: string, sign: number): number | null {
  if (!x && !y) return null;
  if (!x) return 1;
  if (!y) return -1;
  const cmp = x.localeCompare(y, undefined, { sensitivity: "base" });
  return cmp === 0 ? null : cmp * sign;
}

/**
 * Order rows by any sortable column, in the browser.
 *
 * Used on the one path where the server cannot do it: a saved view carrying
 * filter conditions abandons server paging and reads a bulk query fixed to
 * `start_time` ascending, so every header on such a view used to be inert. The
 * page-scoped columns (see above) also come through here.
 *
 * Stable throughout: equal values keep the order they arrived in, which is
 * appointment time.
 */
export function sortAppointments<T extends SortableAppointment>(
  rows: T[],
  column: string,
  direction: SortDirection,
  ctx: AppointmentSortContext,
): T[] {
  const sign = direction === "asc" ? 1 : -1;
  const read = (fn: (row: never) => string, row: T) => String(fn(row as never) ?? "").trim();

  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const tie = a.index - b.index;
      switch (column) {
        case "patient":
          return compareText(read(ctx.patientName, a.row), read(ctx.patientName, b.row), sign) ?? tie;
        case "phone":
          return compareText(read(ctx.phone, a.row), read(ctx.phone, b.row), sign) ?? tie;
        case "doctor":
          return compareText(read(ctx.doctorName, a.row), read(ctx.doctorName, b.row), sign) ?? tie;
        case "service":
        case "reason_for_consultation":
          return compareText(read(ctx.investigation, a.row), read(ctx.investigation, b.row), sign) ?? tie;
        case "status":
          return compareText(String(a.row.status ?? ""), String(b.row.status ?? ""), sign) ?? tie;
        case "bill":
        case "payment_mode": {
          const [first] = sortAppointmentsByPageColumn([a.row, b.row], column, direction, ctx.invoiceFor);
          if (first === a.row && first !== b.row) return -1;
          if (first === b.row && first !== a.row) return 1;
          return tie;
        }
        default: {
          const x = new Date(a.row.start_time ?? 0).getTime() || 0;
          const y = new Date(b.row.start_time ?? 0).getTime() || 0;
          return x === y ? tie : (x - y) * sign;
        }
      }
    })
    .map(({ row }) => row);
}
