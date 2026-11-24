import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Staff ids to names, for the screens that hold a list of people rather than
 * one person.
 *
 * Why this and not the list a picker already loaded: StaffCombobox and
 * StaffMultiCombobox both query `is_active = true` and a role filter, so
 * somebody who has since been deactivated, or whose role was changed after
 * the appointment, is simply missing from it - and their name would vanish
 * from an appointment they really did work on. This looks people up by id, so
 * it finds them whatever their role or state.
 *
 * Shaped after useUserNames in src/lib/history.ts, down to the sorted-join
 * cache key, so the two read the same way.
 */
export function useStaffNames(ids: (string | null | undefined)[]) {
  const clean = Array.from(new Set(ids.filter(Boolean) as string[])).sort();
  return useQuery({
    queryKey: ["staff-names", clean.join(",")],
    enabled: clean.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name")
        .in("id", clean);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const s of data ?? []) {
        map[s.id] = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
      }
      return map;
    },
  });
}
