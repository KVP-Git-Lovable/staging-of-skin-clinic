// Deciding WHICH patients a date-window sync should pull, kept out of index.ts
// so it can be unit-tested (index.ts only runs under Deno).
//
// This matters more than it looks. An invoice is only ever imported as a side
// effect of syncing its patient - nothing fetches billings by date - so a
// patient the window misses is a patient whose bills can never arrive. Widening
// this query is the whole fix for invoices that never reach Billing.

/** A SOQL datetime literal: unquoted, and with no milliseconds. Both are rejected by SOQL. */
export function soqlDateTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid datetime for SOQL: ${String(value)}`);
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Every query that can tell us a patient had activity inside the window.
 *
 * One query used to do this - appointments by Start_Time__c - and it left two
 * holes that silently dropped real bills:
 *
 * 1. A bill dated differently from the visit. Someone seen on the 9th and billed
 *    on the 11th is nowhere in the 11th's window, and a walk-in billed with no
 *    appointment at all is nowhere in any window. Billing__c has to be asked
 *    directly.
 * 2. Start_Time__c being null. A SOQL range comparison drops nulls outright, so
 *    those appointments are invisible to EVERY window. They exist here - they
 *    are the rows the importer timestamps from CreatedDate instead.
 *
 * Billing__c is matched on CreatedDate because that is what the importer stores
 * as invoices.created_at, which is the column Billing and Reports filter on - so
 * the range picked in the app means the same thing on both sides.
 */
export function recentTargetQueries(fromIso: string, toIso: string): string[] {
  const within = (field: string) => `${field} >= ${fromIso} AND ${field} <= ${toIso}`;
  return [
    `SELECT Patient__c FROM Appointment__c WHERE ${within("Start_Time__c")} AND Patient__c != null`,
    `SELECT Patient__c FROM Appointment__c WHERE Start_Time__c = null AND ${within("CreatedDate")} AND Patient__c != null`,
    `SELECT Patient__c FROM Billing__c WHERE ${within("CreatedDate")} AND Patient__c != null`,
  ];
}

/**
 * The distinct Salesforce patient ids across every query's rows.
 *
 * Order is kept stable - first seen, first returned - because the caller pages
 * through this list by offset across several HTTP calls, and a set that
 * reordered between calls would skip or repeat patients.
 */
export function mergePatientIds(resultSets: Array<Array<{ Patient__c?: unknown }>>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rows of resultSets) {
    for (const row of rows) {
      const id = row?.Patient__c == null ? "" : String(row.Patient__c).trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
