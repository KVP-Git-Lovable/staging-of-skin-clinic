import { format } from "date-fns";
import { fetchAppointmentsPage, type FetchAppointmentsPageParams } from "@/lib/appointmentsPage";

const esc = (v: any) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/**
 * Prints the appointment list exactly as filtered on screen - the whole
 * result set, not just the page currently visible. Rows are fetched in
 * large server-side pages, then rendered into a clean landscape print
 * document (no app chrome, repeated table header on every page).
 */
export async function printAppointments(
  params: Omit<FetchAppointmentsPageParams, "page" | "pageSize">,
  opts: { clinicName?: string; rangeLabel: string; staffName: (id: string | null) => string },
) {
  const PAGE = 500;
  const rows: any[] = [];
  for (let page = 1; page <= 40; page++) {
    const res = await fetchAppointmentsPage({ ...params, page, pageSize: PAGE });
    rows.push(...res.rows);
    if (rows.length >= res.total || res.rows.length === 0) break;
  }

  const body = rows
    .map((a) => {
      const p = a.patients;
      const name = p ? `${p.first_name || ""} ${p.last_name || ""}`.trim() : a.patient_name || "—";
      return `<tr>
        <td>${esc(name)}</td>
        <td>${esc(p?.phone || "")}</td>
        <td>${esc(a.service || "")}</td>
        <td>${esc(opts.staffName(a.staff_id))}</td>
        <td>${a.start_time ? esc(format(new Date(a.start_time), "dd MMM yyyy")) : ""}</td>
        <td>${a.start_time ? esc(format(new Date(a.start_time), "hh:mm a")) : ""}</td>
        <td>${esc(a.status || "")}</td>
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
  .empty { font-size: 12px; color: #666; }
</style></head><body>
<h1>${esc(opts.clinicName || "Appointments")}</h1>
<div class="meta">${esc(opts.rangeLabel)} · ${rows.length} appointment(s) · printed ${esc(format(new Date(), "dd MMM yyyy, hh:mm a"))}</div>
${rows.length === 0 ? '<p class="empty">No appointments match the current filters.</p>' : `<table>
<thead><tr><th>Patient</th><th>Phone</th><th>Service</th><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
<tbody>${body}</tbody></table>`}
</body></html>`;

  const win = window.open("", "_blank", "width=1200,height=800");
  if (!win) throw new Error("Please allow pop-ups to print this list.");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
