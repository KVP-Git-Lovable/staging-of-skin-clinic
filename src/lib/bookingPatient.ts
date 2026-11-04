import { supabase } from "@/integrations/supabase/client";

/**
 * The patient a booking is actually for, read from the database.
 *
 * The booking used to take this from the page's cached patient list, and that
 * list is fetched once and held for a minute with nothing invalidating it when
 * a patient is created. The front desk creates a patient and books them
 * twenty to ninety seconds later - every single time, going by the records -
 * so the list almost never has them yet.
 *
 * The patient picker searches the database directly, so it finds them and the
 * booking is made correctly. The lookup against the cached list, right beside
 * it, returns nothing. The result was a confirmation that silently did not go
 * out, under the message "No phone number on this patient's record" - on a
 * screen showing the number.
 *
 * Nothing gave the game away, because a database trigger
 * (appointments_set_patient_name) fills patient_name from the patients table
 * whatever the client sends. The name on the appointment therefore looked
 * right while the phone the client had was empty, which is why this read as a
 * mystery rather than a stale cache.
 *
 * So the patient is read by id at the moment of booking. The cached row is
 * kept only as a fallback for a lookup that could not run at all.
 */

export interface BookingPatient {
  id: string;
  /** First and last joined, or null when there is no name at all. */
  name: string | null;
  phone: string | null;
  gender: string | null;
}

interface PatientRowish {
  id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  gender?: string | null;
}

export function bookingPatientFrom(row: PatientRowish | null | undefined): BookingPatient | null {
  if (!row?.id) return null;
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  const phone = (row.phone ?? "").trim();
  return {
    id: row.id,
    name: name || null,
    phone: phone || null,
    gender: (row.gender ?? null) || null,
  };
}

/**
 * Read the patient this booking is for, falling back to whatever the page
 * already had.
 *
 * The fallback matters only when the lookup itself cannot run - offline, a
 * transient error. A stale row is still better than nothing, and it is what
 * the booking used to use for everybody.
 */
export async function patientForBooking(
  patientId: string | null | undefined,
  cached?: PatientRowish | null,
): Promise<BookingPatient | null> {
  const id = (patientId ?? "").trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from("patients")
    .select("id, first_name, last_name, phone, gender")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return bookingPatientFrom(cached);
  return bookingPatientFrom(data);
}
