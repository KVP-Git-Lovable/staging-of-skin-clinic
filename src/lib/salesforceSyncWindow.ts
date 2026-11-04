/**
 * Date window for the Salesforce date-range sync.
 *
 * The edge function selects appointments by Start_Time__c, so this window is
 * matched against when the appointment HAPPENS, not when it was booked. That is
 * why a forward reach matters: a window that ends today can never pull an
 * appointment scheduled for next week, however recently it was created in
 * Salesforce.
 *
 * Boundaries are set in the browser's own timezone so "today" means the clinic's
 * today for staff using it; the caller converts to UTC when building the query.
 */
export function recentSyncWindow(
  daysBack: number,
  daysForward = 0,
  now: Date = new Date(),
): { start: Date; end: Date } {
  const start = new Date(now);
  start.setDate(start.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setDate(end.getDate() + daysForward);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}
