import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ATTENDANCE_CONFIG, type AttendanceConfig } from "@/lib/attendance";
import type { HolidayRow, WeekOffRow } from "@/lib/workingDays";

/**
 * The attendance settings, for whoever needs them.
 *
 * Everything here is readable by any signed-in user and writable only by an
 * admin - a staff member has to know whether a selfie is required before
 * they can check in, they just cannot change the answer.
 *
 * Falls back to DEFAULT_ATTENDANCE_CONFIG while the row is loading rather
 * than rendering a half-configured page: the defaults are the same values
 * the migration seeds, so nothing changes under somebody mid-check-in.
 *
 * `as never` on the table names: these three tables arrived in migration
 * 20261103120000 and the generated Supabase types are regenerated on sync,
 * so until then the tables are real and the types do not know them.
 */
export function useAttendanceSettings() {
  const { data: config = DEFAULT_ATTENDANCE_CONFIG, refetch: refetchConfig, error: configError } = useQuery({
    queryKey: ["attendance-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_config" as never)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as AttendanceConfig) ?? DEFAULT_ATTENDANCE_CONFIG;
    },
  });

  const { data: weekOffs = [], refetch: refetchWeekOffs, error: weekOffsError } = useQuery({
    queryKey: ["attendance-week-offs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("week_off_config" as never)
        .select("*")
        .order("day_of_week");
      if (error) throw error;
      return (data as unknown as WeekOffRow[]) ?? [];
    },
  });

  const { data: holidays = [], refetch: refetchHolidays, error: holidaysError } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holidays" as never)
        .select("*")
        .order("date");
      if (error) throw error;
      return (data as unknown as HolidayRow[]) ?? [];
    },
  });

  // The errors are returned, not swallowed. When week_off_config was missing
  // from the database entirely, this hook fell back to [] and the tab rendered
  // seven confident "Working day" dropdowns - including for Sunday, which the
  // migration seeds as closed. A settings screen that invents answers when it
  // cannot read them is worse than one that says it is broken.
  return {
    config, weekOffs, holidays,
    refetchConfig, refetchWeekOffs, refetchHolidays,
    configError, weekOffsError, holidaysError,
  };
}
