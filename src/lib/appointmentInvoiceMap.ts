/**
 * Which invoice lookup the appointments list should read.
 *
 * The page fetches invoices two different ways and only ever runs one of them:
 *
 *   - a filtered saved view pulls the whole invoices table, because the matching
 *     appointments are already in memory and there is no server page to scope to;
 *   - otherwise it fetches only the current page's appointment ids.
 *
 * The row cells used to read the page map unconditionally, so under any custom
 * view - where that query is disabled and the map is empty - every Bill Amount
 * and Payment Mode rendered as a dash, while the full map sat right there
 * holding the answer.
 */
export function appointmentInvoiceMap<T>(
  viewHasFilters: boolean,
  fullMap: Map<string, T>,
  pageMap: Map<string, T>,
): Map<string, T> {
  return viewHasFilters ? fullMap : pageMap;
}
