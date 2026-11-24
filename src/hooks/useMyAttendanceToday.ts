import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAttendanceSettings } from "@/hooks/useAttendanceSettings";
import { dayButtons, dayPhase, elapsedLabel, hoursWorked, type AttendanceRecord } from "@/lib/attendance";
import { nonWorkingReason } from "@/lib/workingDays";

/**
 * What a person's day looks like right now - and nothing that changes it.
 *
 * The reading half of useMyAttendanceDay, split out when the clinic asked
 * for the dashboard button to open the attendance page rather than mark
 * attendance where it stands. The dashboard now needs to SAY where somebody
 * is in their day without being able to alter it, and mounting the whole
 * acting hook for that would bring the camera, the face-registration state
 * and the staff-photo query onto a page that can no longer use any of them.
 *
 * useMyAttendanceDay consumes this, so there is still exactly one query, one
 * react-query key and one idea of what "today" means. Marking the day on
 * /attendance refreshes the dashboard card by itself, as it always did.
 */
export const attendanceToday = () => format(new Date(), "yyyy-MM-dd");

export function useMyAttendanceToday() {
  const { staffProfile } = useAuth();
  const staffId = staffProfile?.id;
  const { config, weekOffs, holidays } = useAttendanceSettings();

  const { data: record, refetch } = useQuery({
    queryKey: ["attendance", "today", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records").select("*")
        .eq("staff_id", staffId!).eq("date", attendanceToday()).maybeSingle();
      if (error) throw error;
      return (data as unknown as AttendanceRecord) ?? null;
    },
  });

  return {
    staffId,
    record: record ?? null,
    config,
    weekOffs,
    holidays,
    /** Labelling, not blocking: people do work on days off. */
    closedToday: nonWorkingReason(new Date(), weekOffs, holidays),
    phase: dayPhase(record),
    buttons: dayButtons(record),
    /** Two decimals, for totals. */
    hours: hoursWorked(record?.check_in_time, record?.check_out_time),
    /** "3h 42m", for reading at a glance. */
    elapsed: (now?: Date) => elapsedLabel(record?.check_in_time, record?.check_out_time, now),
    refetch,
  };
}
