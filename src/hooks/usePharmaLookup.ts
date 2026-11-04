import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PHARMA_LOOKUP_COLUMNS, PHARMA_LOOKUP_KEY, type MedicineDefaults } from "@/lib/medicineDefaults";

/**
 * The medicine list every prescribing screen works from.
 *
 * It exists so the columns and the cache key travel together. Four screens
 * used to write this query out separately under the same key and two of them
 * asked for id and name alone, so whichever opened first decided whether the
 * pharmacy's prescription defaults reached the doctor at all.
 */
export interface PharmaLookupProduct extends MedicineDefaults {
  id: string;
  name: string;
}

export function usePharmaLookup() {
  return useQuery({
    queryKey: PHARMA_LOOKUP_KEY,
    // Always re-read when a prescribing screen opens. The app holds queries
    // for a minute and does not refetch on window focus - deliberately, it is
    // what stopped the whole page reloading itself - but that left this list
    // as old as the tab when the medicine a doctor needs was added, or
    // removed, on another machine. 256 rows of five columns is cheap enough to
    // read on every open, and an id that has gone from the catalogue is
    // rejected by the database on save.
    refetchOnMount: "always",
    queryFn: async (): Promise<PharmaLookupProduct[]> => {
      const { data, error } = await supabase.from("pharma_products").select(PHARMA_LOOKUP_COLUMNS).order("name");
      if (error) throw error;
      return (data || []) as PharmaLookupProduct[];
    },
  });
}
