import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Derive a short, human-friendly Patient ID from the Supabase UUID.
 * Mirrors the logic used in the invoice PDF edge function so that the
 * value displayed in patient profile / lists matches what's printed on
 * the invoice.
 */
export function shortPatientId(id?: string | null): string {
  if (!id) return "";
  const hex = id.replace(/-/g, "");
  return `P-${hex.slice(-5).toUpperCase()}`;
}

/**
 * The same idea for an appointment, so one can be read out or searched for.
 *
 * Appointments have no number of their own - only the UUID and a raw
 * Salesforce id like "a08OW00000AXUfvYAH", which nobody is going to say over
 * the phone. This mirrors shortPatientId so the two read as a pair.
 */
export function shortAppointmentId(id?: string | null): string {
  if (!id) return "";
  const hex = id.replace(/-/g, "");
  return `A-${hex.slice(-5).toUpperCase()}`;
}
