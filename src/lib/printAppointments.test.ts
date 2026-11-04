import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const fetchAppointmentsPage = vi.fn();
vi.mock("@/lib/appointmentsPage", () => ({
  fetchAppointmentsPage: (...args: unknown[]) => fetchAppointmentsPage(...args),
}));

import { printAppointments } from "./printAppointments";

/** A print window that records what was written to it instead of opening one. */
function stubPrintWindow() {
  const written: string[] = [];
  const win = {
    document: { write: (html: string) => written.push(html), close: () => {} },
    focus: () => {},
    print: () => {},
  };
  vi.stubGlobal("open", () => win);
  return written;
}

const row = (start: string, patient: string) => ({
  start_time: start,
  patients: { first_name: patient, last_name: "", phone: "" },
  staff_id: null,
  status: "Confirmed",
  reason_for_consultation: "Review",
  service: "Consultation",
});

const opts = { rangeLabel: "Tomorrow", staffName: () => "Dr Vindhya Pai" };

const baseParams = {
  dateRange: null,
  doctorIds: [],
  status: "all",
  visitStatus: "all",
  search: "",
};

describe("printAppointments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAppointmentsPage.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("always asks for appointments in clock order, earliest first", async () => {
    fetchAppointmentsPage.mockResolvedValue({ rows: [], total: 0 });
    stubPrintWindow();

    await printAppointments(baseParams, opts);

    expect(fetchAppointmentsPage).toHaveBeenCalled();
    const sent = fetchAppointmentsPage.mock.calls[0][0];
    expect(sent.sortColumn).toBe("start_time");
    expect(sent.sortDirection).toBe("asc");
  });

  it("ignores a descending sort coming from the screen", async () => {
    fetchAppointmentsPage.mockResolvedValue({ rows: [], total: 0 });
    stubPrintWindow();

    // What the page used to pass through, and what printed the evening first.
    await printAppointments(
      { ...baseParams, sortColumn: "start_time", sortDirection: "desc" } as never,
      opts,
    );

    const sent = fetchAppointmentsPage.mock.calls[0][0];
    expect(sent.sortDirection).toBe("asc");
  });

  it("keeps the screen's filters", async () => {
    fetchAppointmentsPage.mockResolvedValue({ rows: [], total: 0 });
    stubPrintWindow();

    const range = { start: new Date("2026-09-19T00:00:00Z"), end: new Date("2026-09-19T23:59:59Z") };
    await printAppointments(
      { ...baseParams, dateRange: range, doctorIds: ["abc"], status: "Confirmed", search: "shetty" },
      opts,
    );

    const sent = fetchAppointmentsPage.mock.calls[0][0];
    expect(sent.dateRange).toBe(range);
    expect(sent.doctorIds).toEqual(["abc"]);
    expect(sent.status).toBe("Confirmed");
    expect(sent.search).toBe("shetty");
  });

  it("renders the rows in the order the server returned them", async () => {
    fetchAppointmentsPage.mockResolvedValue({
      rows: [
        row("2026-09-19T05:00:00Z", "Morning"),
        row("2026-09-19T07:00:00Z", "Midday"),
        row("2026-09-19T13:00:00Z", "Evening"),
      ],
      total: 3,
    });
    const written = stubPrintWindow();

    await printAppointments(baseParams, opts);

    const html = written.join("");
    expect(html.indexOf("Morning")).toBeLessThan(html.indexOf("Midday"));
    expect(html.indexOf("Midday")).toBeLessThan(html.indexOf("Evening"));
  });
});

describe("printAppointments - the printed sheet's layout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAppointmentsPage.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const printed = async (rows: unknown[]) => {
    fetchAppointmentsPage.mockResolvedValue({ rows, total: rows.length });
    const written = stubPrintWindow();
    await printAppointments(baseParams, opts);
    return written.join("");
  };

  it("heads the columns in the order the list on screen uses", async () => {
    const html = await printed([row("2026-09-24T10:15:00", "Angel")]);
    expect(html).toContain(
      "<thead><tr><th>#</th><th>Patient</th><th>Phone</th><th>Doctor</th><th>Date</th><th>Time</th><th>Investigation</th><th>Status</th></tr></thead>",
    );
  });

  it("numbers the rows from one, down the sheet", async () => {
    const html = await printed([
      row("2026-09-24T10:15:00", "Angel"),
      row("2026-09-24T10:30:00", "Keerthi"),
      row("2026-09-24T11:00:00", "Lakshmi"),
    ]);
    // The number precedes the name it belongs to, in clock order.
    expect(html.indexOf("<td>1</td>")).toBeLessThan(html.indexOf("Angel"));
    expect(html.indexOf("Angel")).toBeLessThan(html.indexOf("<td>2</td>"));
    expect(html.indexOf("<td>2</td>")).toBeLessThan(html.indexOf("Keerthi"));
    expect(html).toContain("<td>3</td>");
  });

  it("prints the date as dd/mm/yyyy, which reads the same on every clinic PC", async () => {
    const html = await printed([row("2026-09-24T10:15:00", "Angel")]);
    // Scoped to the rows: the "printed on" line in the header keeps its own
    // long-form date, and matching the whole document would catch that instead.
    const tbody = html.slice(html.indexOf("<tbody>"), html.indexOf("</tbody>"));
    expect(tbody).toContain("<td>24/09/2026</td>");
    expect(tbody).not.toContain("24 Sep 2026");
  });

  it("prints the start time only", async () => {
    const html = await printed([
      { ...row("2026-09-24T10:15:00", "Angel"), end_time: "2026-09-24T10:45:00" },
    ]);
    expect(html).toContain("10:15 AM");
    expect(html).not.toContain("10:45 AM");
  });

  it("puts the patient before the doctor and the investigation after both", async () => {
    const html = await printed([row("2026-09-24T10:15:00", "Angel")]);
    expect(html.indexOf("Angel")).toBeLessThan(html.indexOf("Dr Vindhya Pai"));
    expect(html.indexOf("Dr Vindhya Pai")).toBeLessThan(html.indexOf("Review"));
  });
});

/**
 * A sheet printed for the front desk should say what the screen said. The
 * clinic marks a patient VIP so whoever greets them knows; a day sheet carried
 * out to the desk that leaves the mark off defeats the point of making it.
 */
describe("printAppointments - the VIP mark", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAppointmentsPage.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const vipRow = (start: string, patient: string, is_vip: boolean) => ({
    ...row(start, patient),
    patients: { first_name: patient, last_name: "", phone: "", is_vip },
  });

  const printed = async (rows: unknown[]) => {
    fetchAppointmentsPage.mockResolvedValue({ rows, total: rows.length });
    const written = stubPrintWindow();
    await printAppointments(baseParams, opts);
    return written.join("");
  };

  it("marks the patient the clinic marked", async () => {
    const html = await printed([vipRow("2026-10-27T10:15:00", "Sanah", true)]);
    expect(html).toContain('Sanah <span class="vip">VIP</span>');
  });

  it("leaves everyone else unmarked", async () => {
    const html = await printed([vipRow("2026-10-27T10:15:00", "Shilpa", false)]);
    expect(html).not.toContain('class="vip"');
  });

  // An appointment fetched without the patient join must not be guessed into a
  // VIP - a mark that should not be there is worse than one that is missing.
  it("marks nobody when the flag was never fetched", async () => {
    const html = await printed([row("2026-10-27T10:15:00", "Devaki")]);
    expect(html).not.toContain('class="vip"');
  });

  it("puts the mark beside the name, not in a column of its own", async () => {
    const html = await printed([vipRow("2026-10-27T10:15:00", "Sanah", true)]);
    // The heading row is untouched: no new column, so nothing else on the
    // sheet shifts.
    expect(html).toContain(
      "<thead><tr><th>#</th><th>Patient</th><th>Phone</th><th>Doctor</th><th>Date</th><th>Time</th><th>Investigation</th><th>Status</th></tr></thead>",
    );
    expect(html).toContain('<td>Sanah <span class="vip">VIP</span></td>');
  });

  // Browsers drop background colours when printing, and a clinic may print in
  // black and white, so the mark cannot rely on the gold fill alone.
  it("stays legible without colour", async () => {
    const html = await printed([vipRow("2026-10-27T10:15:00", "Sanah", true)]);
    expect(html).toContain("print-color-adjust: exact");
    expect(html).toMatch(/\.vip\s*\{[^}]*border:\s*1px solid/);
    expect(html).toMatch(/\.vip\s*\{[^}]*font-weight:\s*700/);
  });
});
