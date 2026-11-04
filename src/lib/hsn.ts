/**
 * Which HSN codes a new invoice line may use.
 *
 * The clinic retires a code by unticking it in the Tax Master
 * (hsn_tax_master.is_active), and that has to be the end of it. The invoice form
 * used to add "whatever code is already on this line" to the dropdown on top of
 * the active list, which meant a service still storing an old code - 9997 - put
 * it straight back in front of the front desk.
 *
 * Dropping it from the dropdown alone would not have been enough. The line would
 * still hold the retired code, the select would merely render blank because its
 * value was no longer among its options, and the invoice would still save and
 * print 9997. So a retired code is kept off the line in the first place, not
 * just out of the list.
 */

export interface HsnMasterRow {
  hsn_code: string | null;
}

/** The codes the Tax Master currently allows. Callers pass already-active rows. */
export function activeHsnCodes(rows: HsnMasterRow[] | null | undefined): string[] {
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    const code = String(row?.hsn_code ?? "").trim();
    if (code) seen.add(code);
  }
  return [...seen];
}

/** Dropdown options for an HSN field: the active codes, nothing else. */
export function hsnOptions(rows: HsnMasterRow[] | null | undefined): { id: string; name: string }[] {
  return activeHsnCodes(rows).map((code) => ({ id: code, name: code }));
}

/**
 * The code to put on a new line, given what the service master stores.
 *
 * Returns "" for a retired code, so the line carries no HSN rather than one the
 * dropdown will not show.
 *
 * IMPORTANT: while the Tax Master is still loading there are no active codes
 * yet, and blanking every HSN on that basis would quietly strip valid codes from
 * lines built in those first milliseconds. With nothing to check against, the
 * code is passed through untouched.
 */
export function liveHsn(code: string | null | undefined, activeCodes: string[]): string {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return "";
  if (activeCodes.length === 0) return trimmed;
  return activeCodes.includes(trimmed) ? trimmed : "";
}
