import { format } from "date-fns";
import { reserveTab, type PendingTab } from "./newTab";
import { fetchAppointmentsPage, type FetchAppointmentsPageParams } from "@/lib/appointmentsPage";
import { displayDate } from "@/lib/dateInput";
import { investigationText } from "@/lib/investigationText";
import { appointmentPatientName, appointmentPatientIsVip } from "@/lib/appointmentPatientName";
import { appointmentStatusLabel } from "@/lib/appointmentStatus";
import { fetchInvoicesByAppointmentIds, invoiceMapByAppointment, type VisitBill } from "@/lib/invoicesForAppointments";
import { supabase } from "@/integrations/supabase/client";

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * A printed list is a day sheet: staff work down it as the day runs, so it is
 * always in clock order, earliest first.
 *
 * Deliberately not the list's sort. The screen legitimately sorts newest-first,
 * or by patient, or by status - inheriting that printed the evening before the
 * morning. The sort keys are left out of this function's parameters entirely so
 * a caller cannot reintroduce the problem by passing its own.
 */
const PRINT_SORT = { sortColumn: "start_time", sortDirection: "asc" } as const;

/**
 * Prints the appointment list exactly as filtered on screen - the whole
 * result set, not just the page currently visible. Rows are fetched in
 * large server-side pages, then rendered into a clean landscape print
 * document (no app chrome, repeated table header on every page).
 *
 * Filters follow the screen; the order does not (see PRINT_SORT).
 */
export async function printAppointments(
  params: Omit<FetchAppointmentsPageParams, "page" | "pageSize" | "sortColumn" | "sortDirection">,
  opts: { clinicName?: string; rangeLabel: string; staffName: (id: string | null) => string },
  /**
   * The tab the click already reserved. Fetching the whole filtered list
   * takes several seconds - a window opened once that is done is blocked as
   * a pop-up, which is why this used to end in "Please allow pop-ups".
   * Reserved here when the caller did not, so tests and any other caller
   * still work.
   */
  tab: PendingTab = reserveTab("Preparing the appointment list…"),
) {
  const PAGE = 500;
  const rows: any[] = [];
  try {
    for (let page = 1; page <= 40; page++) {
      const res = await fetchAppointmentsPage({ ...params, ...PRINT_SORT, page, pageSize: PAGE });
      rows.push(...res.rows);
      if (rows.length >= res.total || res.rows.length === 0) break;
    }
  } catch (e) {
    // Don't leave the reserved tab sitting on the placeholder forever.
    tab.cancel();
    throw e;
  }

  /**
   * The bills behind the printed visits.
   *
   * The sheet used to print the appointment's status and call anything
   * "Completed" billed, which is not a reliable record of a bill: a visit
   * imported from Salesforce can be Completed with no invoice at all, and a
   * visit paid minutes before its slot stays on "Confirmed". The sheet is
   * carried to the front desk and read as fact, so it asks for the bills.
   *
   * Best-effort on purpose. If the lookup fails the sheet still prints, with
   * each row showing its plain status - never a "Billed" nobody can back up.
   */
  let billedApptIds = new Set<string>();
  try {
    const bills = await fetchInvoicesByAppointmentIds(async (ids: string[]) => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, appointment_id, status, created_at")
        .in("appointment_id", ids);
      if (error) throw error;
      return data || [];
    }, rows.map((a) => a.id).filter(Boolean));
    billedApptIds = new Set(invoiceMapByAppointment(bills as VisitBill[]).keys());
  } catch {
    // Printing the list matters more than the billing column.
  }

  const body = rows
    .map((a, i) => {
      const p = a.patients;
      const name = appointmentPatientName(a);
      // The same mark the screen shows, so a sheet carried to the front desk
      // says what the screen said. The word rather than the crown: a printer
      // substitutes a font it has, and a missing glyph prints as a box.
      const vip = appointmentPatientIsVip(a) ? ' <span class="vip">VIP</span>' : "";
      // Same column order as the list on screen, so a printed sheet can be read
      // alongside it. Date is dd/MM/yyyy via the app's own displayDate, and the
      // start time only - the end time is recorded but not printed.
      return `<tr>
        <td>${i + 1}</td>
        <td>${esc(name)}${vip}</td>
        <td>${esc(p?.phone || "")}</td>
        <td>${esc(opts.staffName(a.staff_id))}</td>
        <td>${a.start_time ? esc(displayDate(a.start_time)) : ""}</td>
        <td>${a.start_time ? esc(format(new Date(a.start_time), "hh:mm a")) : ""}</td>
        <td class="inv">${esc(investigationText(a, "—"))}</td>
        <td>${esc(appointmentStatusLabel(a.status, billedApptIds.has(a.id)))}</td>
      </tr>`;
    })
    .join("");

  const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>Appointments — ${esc(opts.rangeLabel)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .meta { font-size: 11px; color: #555; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #d4d4d4; padding: 4px 6px; text-align: left; }
  th { background: #f1f5f4; font-weight: 600; }
  tr { page-break-inside: avoid; }
  /* Imported Investigation text runs to paragraphs. Bounded and wrapped so
     one long entry cannot starve the Patient/Doctor/Date columns - wrapped
     rather than clipped, because paper has no hover title to recover from. */
  .inv { max-width: 70mm; overflow-wrap: break-word; }
  .empty { font-size: 12px; color: #666; }
  /* The serial number is a counter, not data - it should not take width. */
  td:first-child, th:first-child { width: 8mm; text-align: right; color: #555; }
  /* The VIP mark. Browsers drop background colours when printing unless told
     otherwise, and a clinic may well print in black and white, so the border
     and the bold word carry it on their own - the gold is a bonus when the
     printer is in colour. nowrap keeps it whole beside the name. */
  .vip {
    display: inline-block;
    white-space: nowrap;
    margin-left: 4px;
    padding: 0 4px;
    border: 1px solid #b8912f;
    border-radius: 8px;
    background: #fdf3d7;
    color: #6b4f12;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.03em;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
</style></head><body>
<h1>${esc(opts.clinicName || "Appointments")}</h1>
<div class="meta">${esc(opts.rangeLabel)} · ${rows.length} appointment(s) · printed ${esc(format(new Date(), "dd MMM yyyy, hh:mm a"))}</div>
${rows.length === 0 ? '<p class="empty">No appointments match the current filters.</p>' : `<table>
<thead><tr><th>#</th><th>Patient</th><th>Phone</th><th>Doctor</th><th>Date</th><th>Time</th><th>Investigation</th><th>Status</th></tr></thead>
<tbody>${body}</tbody></table>`}
</body></html>`;

  if (tab.blocked) throw new Error("Please allow pop-ups to print this list.");
  tab.write(html);
  tab.print(400);
}
