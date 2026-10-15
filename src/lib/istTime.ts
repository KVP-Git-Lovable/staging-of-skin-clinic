/**
 * India Standard Time helpers for date/time fields. IST is UTC+05:30 with no daylight saving,
 * so conversions are fixed offsets; display goes through Intl with the Asia/Kolkata zone.
 */
export const IST_TIMEZONE = "Asia/Kolkata";
const IST_OFFSET_MIN = 330;

/** "YYYY-MM-DD" + "HH:mm" typed as IST → ISO-8601 UTC instant. Returns null for blank/invalid input. */
export function istToIso(date: string, time = "00:00"): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!dm) return null;
  const tm = /^(\d{1,2}):(\d{2})$/.exec(String(time || "00:00").trim()) || ["", "0", "0"];
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const utcMs = Date.UTC(y, mo - 1, d, h, mi) - IST_OFFSET_MIN * 60_000;
  const out = new Date(utcMs);
  return Number.isNaN(out.getTime()) ? null : out.toISOString();
}

/** ISO instant (any offset) → the IST wall-clock date and time. */
export function isoToIst(iso: string | null | undefined): { date: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}

const fmtDate = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIMEZONE, day: "numeric", month: "short", year: "numeric" });
const fmtDateTime = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TIMEZONE, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** Human display in IST, e.g. "1 Oct 2026, 00:00 IST". */
export function formatIst(iso: string | null | undefined, withTime = true): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return withTime ? `${fmtDateTime.format(d)} IST` : fmtDate.format(d);
}
