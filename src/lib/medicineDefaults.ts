/**
 * The prescription defaults a medicine carries from the Pharmacy master.
 *
 * The pharmacy sets a Default Frequency, Duration and Special Instructions on
 * each product so a doctor does not have to type "Apply moisturiser twice
 * daily on clean and damp skin" 239 times. None of it ever reached a doctor.
 *
 * The reason was not the filling - the prescription form did fill those boxes.
 * Four screens loaded the product list under the same React Query key,
 * "pharma-products-lookup", but asked for different columns: two selected the
 * defaults, two selected only id and name. Whichever screen the doctor opened
 * first won the cache, and the Procedure detail sheet - open all day in this
 * clinic - was one of the two that asked for id and name alone. The form then
 * read `product.default_frequency` off a row that had never carried it, got
 * undefined, and filled in nothing.
 *
 * One list of columns and one query key, here, so no screen can ask for less
 * than another and quietly starve the rest.
 */

/** Every screen that looks up a medicine asks for exactly these. */
export const PHARMA_LOOKUP_COLUMNS = "id, name, default_frequency, default_duration, default_instructions";

/** Shared across screens: one shape of row behind one key. */
export const PHARMA_LOOKUP_KEY = ["pharma-products-lookup"] as const;

export interface MedicineDefaults {
  default_frequency?: string | null;
  default_duration?: string | null;
  default_instructions?: string | null;
}

/** What a prescription row holds - null where a saved row never had one. */
export interface MedicineRowFields {
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
}

/**
 * Carry a field over only when the doctor has not made it theirs: it is empty,
 * or it still holds what the medicine they had selected before filled in.
 *
 * Switching medicine swaps one set of defaults for the other; anything typed
 * by hand stays, because a prescription is the doctor's, not the master's.
 */
const carryOver = (current: string | null | undefined, previousDefault?: string | null): boolean =>
  !(current ?? "").trim() || current === (previousDefault || "");

/**
 * The frequency, duration and instructions a row should show once `next` is the
 * selected medicine. `previous` is the medicine it held before, if any.
 */
export function applyMedicineDefaults(
  row: MedicineRowFields,
  next: MedicineDefaults | null | undefined,
  previous?: MedicineDefaults | null,
): { frequency: string; duration: string; instructions: string } {
  return {
    frequency: carryOver(row.frequency, previous?.default_frequency)
      ? next?.default_frequency || ""
      : row.frequency || "",
    duration: carryOver(row.duration, previous?.default_duration) ? next?.default_duration || "" : row.duration || "",
    instructions: carryOver(row.instructions, previous?.default_instructions)
      ? next?.default_instructions || ""
      : row.instructions || "",
  };
}
