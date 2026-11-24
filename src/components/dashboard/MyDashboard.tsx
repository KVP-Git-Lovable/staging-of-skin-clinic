import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, CalendarCheck, Clock, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyAttendanceToday } from "@/hooks/useMyAttendanceToday";
import { MyDayCard } from "@/components/attendance/MyDayCard";
import { therapistIdsOf } from "@/lib/appointmentTherapist";
import { appointmentPatientName, appointmentPatientInitialsText } from "@/lib/appointmentPatientName";
import { appointmentStatusLabel, showsAsBilled, BILLED_BADGE_CLASSES } from "@/lib/appointmentStatus";
import { historyRange, historyRows, historyTotals, hoursLabel } from "@/lib/attendanceHistory";
import type { AttendanceRow } from "@/lib/attendance";

/**
 * The dashboard for somebody who is not running the clinic.
 *
 * A therapist signing in used to land on the clinic's whole day - 39
 * appointments, every doctor's name, the NPS score, the pending invoices.
 * This is what they get instead: their own working day, and the
 * appointments assigned to them.
 *
 * One component for both scopes, because they differ by a single block.
 * Reception and the pharmacy get `withAppointments={false}` and see their
 * attendance alone, which is what the clinic asked for.
 *
 * Built for a phone first. These are the people who will open it on one, at
 * the clinic door, and every block here is a single column that stacks.
 */

interface Props {
  /** Therapists and nurses. Reception sees attendance alone. */
  withAppointments: boolean;
}

export function MyDashboard({ withAppointments }: Props) {
  const { staffProfile } = useAuth();
  const staffId = staffProfile?.id;
  const { weekOffs, holidays } = useMyAttendanceToday();

  const dayStart = startOfDay(new Date()).toISOString();
  const dayEnd = endOfDay(new Date()).toISOString();

  const { data: todays = [], isLoading } = useQuery({
    queryKey: ["my-dashboard-appointments", staffId, dayStart],
    enabled: !!staffId && withAppointments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, start_time, service, status, patient_name, therapist_id, therapist_ids, patients(first_name, last_name)")
        .gte("start_time", dayStart)
        .lte("start_time", dayEnd)
        .order("start_time");
      if (error) throw error;
      return data ?? [];
    },
    // The front desk assigns therapists through the day, so a therapist
    // opening this at eleven must not be shown what was true at nine.
    refetchOnMount: "always",
  });

  // Decided by therapistIdsOf, the same helper the pickers and the saved-view
  // filter use: it reads therapist_ids when there is one and falls back to
  // therapist_id, so an appointment saved on the published build still counts.
  const mine = useMemo(
    () => (staffId ? todays.filter((a) => therapistIdsOf(a as never).includes(staffId)) : []),
    [todays, staffId],
  );

  // This week's attendance, from the same functions /attendance reads.
  const week = historyRange("week", new Date());
  const { data: weekRecords = [] } = useQuery({
    queryKey: ["my-dashboard-week", staffId, week.from, week.to],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("date, check_in_time, check_out_time")
        .eq("staff_id", staffId!)
        .gte("date", week.from)
        .lte("date", week.to);
      if (error) throw error;
      return (data ?? []) as unknown as AttendanceRow[];
    },
  });
  const weekTotals = historyTotals(historyRows(weekRecords, week, weekOffs, holidays));

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">My Day</h1>
        <p className="page-subtitle">{format(new Date(), "EEEE, d MMMM yyyy")}</p>
      </div>

      <MyDayCard />

      {withAppointments && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="data-table mb-4"
          aria-label="My appointments today"
        >
          <div className="flex items-center justify-between gap-3 border-b p-4 md:p-5">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold md:text-lg">
              <Stethoscope className="h-4 w-4 text-primary" />
              My appointments today
            </h2>
            {mine.length > 0 && (
              <span className="text-xs text-muted-foreground" data-testid="my-appointment-count">
                {mine.length}
              </span>
            )}
          </div>

          <div className="divide-y">
            {isLoading ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>
            ) : mine.length === 0 ? (
              // Not a bare "none": no appointment in this clinic has ever had
              // a therapist on it, so the first person to open this would
              // reasonably think the screen was broken.
              <div className="p-6 text-center" data-testid="no-appointments-assigned">
                <p className="text-sm font-medium">No appointments are assigned to you today.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A doctor or the front desk picks the therapist or nurse on the appointment.
                  Yours will appear here as soon as they do.
                </p>
              </div>
            ) : (
              mine.map((apt) => (
                <Link
                  key={(apt as { id: string }).id}
                  to="/appointments"
                  className="flex items-center justify-between gap-2 p-3 transition-colors hover:bg-muted/50 md:p-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-xs font-semibold text-primary">
                      {appointmentPatientInitialsText(apt as never)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {appointmentPatientName(apt as never, "Walk-in")}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(apt as { service?: string }).service || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* The time stays on a phone, unlike the clinic list:
                        with three or four rows there is room, and "when" is
                        the whole question somebody opens this to answer. */}
                    <span className="text-xs text-muted-foreground">
                      {format(new Date((apt as { start_time: string }).start_time), "h:mm a")}
                    </span>
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        showsAsBilled((apt as { status: string }).status, false)
                          ? BILLED_BADGE_CLASSES
                          : "bg-muted"
                      }`}
                    >
                      {appointmentStatusLabel((apt as { status: string }).status, false)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </motion.section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="rounded-xl border bg-card p-4 shadow-sm md:p-5"
        aria-label="My week so far"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold md:text-lg">
            <CalendarCheck className="h-4 w-4 text-primary" />
            My week so far
          </h2>
          <Link to="/attendance" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            Full attendance <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <strong data-testid="week-hours">{hoursLabel(weekTotals.totalHours)}</strong> worked
          </span>
          <span className="text-muted-foreground">
            {weekTotals.daysPresent} {weekTotals.daysPresent === 1 ? "day" : "days"} present
          </span>
          {weekTotals.daysOpen > 0 && (
            <span className="text-muted-foreground">{weekTotals.daysOpen} not closed</span>
          )}
        </div>
      </motion.section>
    </div>
  );
}

export default MyDashboard;
