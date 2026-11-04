import { supabase } from "@/integrations/supabase/client";
import { hasRealName } from "@/lib/patientName";

/**
 * Which patients belong in a picker's list, and how that list is fetched.
 *
 * `patientName.ts` next door owns what counts as a name. This owns what to do
 * about it: drop the rows that have none, drop the patient who cannot refer
 * themselves, and stop at a page.
 *
 * It is one module because the dropdown had TWO functions fetching this list
 * under one react-query cache key - the real query, which fetched 500 rows and
 * filtered out the phone-named ones, and a "warm the cache" prefetch that
 * fetched 50 and filtered nothing. The prefetch was issued first, so its
 * unfiltered 50 were what the clinic saw, and since those 50 are exactly the
 * phone-named records, every patient dropdown in the app opened on a wall of
 * "Unnamed - 6282285155".
 *
 * There is now one function that can fetch this list, so a second copy of it
 * cannot drift away from the first.
 */

export interface PickerPatient {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  source?: string | null;
  source_ad_details?: string | null;
  source_referral_doctor?: string | null;
}

export const PATIENT_PICKER_PAGE_SIZE = 50;

/**
 * Enough rows to clear the block of phone-named records that sort to the front.
 *
 * 153 imported records hold the phone number in the name column, and digits
 * sort before letters, so they occupy the first 153 rows of any list ordered by
 * first_name - which is more than the 50 a page shows. Fetching 500 carries all
 * 153 plus ~347 real names.
 *
 * If a future import ever pushed the phone-named count past this, the list
 * would come back short rather than wrong: `pickPickerRows` still removes every
 * one of them, and an empty list tells the caller to type instead. That case is
 * tested.
 */
export const PATIENT_PICKER_FETCH = PATIENT_PICKER_PAGE_SIZE * 10;

export const patientPickerColumns = (withSource: boolean) =>
  withSource
    ? "id, first_name, last_name, phone, source, source_ad_details, source_referral_doctor"
    : "id, first_name, last_name, phone";

export interface PickRowsOptions {
  /** Drop rows whose name is only a phone number. The unsearched list does. */
  requireName?: boolean;
  /** A patient who must not appear - nobody refers themselves. */
  excludeId?: string | null;
  limit?: number;
}

/**
 * The rows worth showing, from the rows fetched.
 *
 * Pure, so the rule can be tested without a dropdown, and applied at render
 * time rather than inside the query: the fetched list is cached and shared by
 * every screen that shows a picker, while `excludeId` differs per screen.
 */
export function pickPickerRows<T extends { id: string; first_name?: string | null; last_name?: string | null }>(
  rows: T[] | null | undefined,
  { requireName = false, excludeId = null, limit }: PickRowsOptions = {},
): T[] {
  let out = rows ?? [];
  if (requireName) out = out.filter(hasRealName);
  if (excludeId) out = out.filter((r) => r.id !== excludeId);
  return typeof limit === "number" ? out.slice(0, limit) : out;
}

/**
 * The patients a picker shows before anything is typed.
 *
 * The ONE place this list is fetched. Anything that wants to warm it must call
 * this - a second fetch written beside it is how the "Unnamed" wall came back.
 */
export async function fetchInitialPatients(withSource: boolean): Promise<PickerPatient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select(patientPickerColumns(withSource))
    .order("first_name")
    .range(0, PATIENT_PICKER_FETCH - 1);
  if (error) throw error;
  return pickPickerRows(((data ?? []) as unknown) as PickerPatient[], {
    requireName: true,
    limit: PATIENT_PICKER_PAGE_SIZE,
  });
}
