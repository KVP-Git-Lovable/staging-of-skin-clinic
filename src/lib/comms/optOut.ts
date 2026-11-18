/** The key opt-outs are stored under: the last 10 digits of the phone number. Null when there are fewer than 10 digits. */
export function optOutKey(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}
