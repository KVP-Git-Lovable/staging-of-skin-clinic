import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useMyAttendanceToday } from "@/hooks/useMyAttendanceToday";
import {
  historyRange, historyRows, historyTotals, hoursLabel, shiftAnchor, type HistoryView,
} from "@/lib/attendanceHistory";
import type { AttendanceRow } from "@/lib/attendance";

/**
 * A person's own attendance, back over a day, a week or a month.
 *
 * /attendance showed today and nothing else, so nobody could answer "how
 * many hours did I work last week" without asking an admin to look.
 *
 * Own rows only, and not because this query says so: the RLS on
 * attendance_records (20261102140000) is "your own unless you are an admin",
 * so the staff_id filter below is for the index, not for the privacy. An
 * admin opening this page sees their own days here and everybody's under
 * Admin > Attendance, which is the page for that.
 *
 * All the arithmetic is in src/lib/attendanceHistory.ts so the week
 * boundaries, the month lengths and the totals can be tested without a
 * database or a clock.
 */

const VIEWS: { key: HistoryView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

export function MyAttendanceHistory() {
  const { staffId, weekOffs, holidays } = useMyAttendanceToday();
  const [view, setView] = useState<HistoryView>("week");
  const [anchor, setAnchor] = useState(() => new Date());

  const range = useMemo(() => historyRange(view, anchor), [view, anchor]);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", "history", staffId, range.from, range.to],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("date, check_in_time, check_out_time, check_in_face_status, check_out_face_status")
        .eq("staff_id", staffId!)
        .gte("date", range.from)
        .lte("date", range.to)
        .order("date");
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceRow[];
    },
  });

  const rows = useMemo(
    () => historyRows(records, range, weekOffs, holidays),
    [records, range, weekOffs, holidays],
  );
  const totals = historyTotals(rows);

  // Day view is one date, so naming the period twice would be noise.
  const periodLabel =
    view === "day" ? format(new Date(range.from + "T12:00:00"), "EEEE, d MMMM yyyy")
    : view === "month" ? format(new Date(range.from + "T12:00:00"), "MMMM yyyy")
    : `${format(new Date(range.from + "T12:00:00"), "d MMM")} – ${format(new Date(range.to + "T12:00:00"), "d MMM yyyy")}`;

  return (
    <Card data-testid="my-attendance-history">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-lg">My attendance</CardTitle>
          <div className="flex rounded-lg border p-0.5">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => { setView(v.key); setAnchor(new Date()); }}
                aria-pressed={view === v.key}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  view === v.key ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="icon" aria-label="Previous period"
            onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <p className="text-sm font-medium" data-testid="history-period">{periodLabel}</p>
          <Button type="button" variant="ghost" size="icon" aria-label="Next period"
            onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-primary" />
            <strong data-testid="history-total-hours">{hoursLabel(totals.totalHours)}</strong> worked
          </span>
          <span className="text-muted-foreground">
            {totals.daysPresent} {totals.daysPresent === 1 ? "day" : "days"} present
          </span>
          {/* A punch somebody forgot is the thing a regularisation fixes, so
              it is named rather than left to be inferred from a blank. */}
          {totals.daysOpen > 0 && (
            <span className="text-muted-foreground">
              {totals.daysOpen} not closed
            </span>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto table-scroll">
            <table className="w-full responsive-table text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Punch in</th>
                  <th className="p-2 text-left">Punch out</th>
                  <th className="p-2 text-left">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.date} className={r.present ? "" : "text-muted-foreground"}>
                    <td className="p-2 whitespace-nowrap" data-label="Date">
                      {format(new Date(r.date + "T12:00:00"), "EEE d MMM")}
                      {r.closed && (
                        <Badge variant="outline" className="ml-2 text-[10px] font-normal">{r.closed}</Badge>
                      )}
                    </td>
                    <td className="p-2" data-label="Punch in">
                      {r.checkIn ? format(new Date(r.checkIn), "h:mm a") : "—"}
                    </td>
                    <td className="p-2" data-label="Punch out">
                      {r.checkOut ? format(new Date(r.checkOut), "h:mm a") : "—"}
                    </td>
                    <td className="p-2" data-label="Hours">
                      {/* A day in progress is not zero hours, and must not
                          read as if somebody clocked in and straight out. */}
                      {r.present && r.hours === null ? "Still open" : hoursLabel(r.hours)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default MyAttendanceHistory;
