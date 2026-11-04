/**
 * What is narrowing the appointments list, in words.
 *
 * The list restores its filters from the browser on every load - the doctor,
 * the status, the visit status and the date - and the panel they live in is
 * closed by default. So a filter set once, weeks ago, goes on narrowing every
 * visit with nothing on screen saying so. "Todays Appointments" read 0 items
 * over a day with 43 appointments in it, and looked like a data fault.
 *
 * The page already carries a note about the same disease in a different organ:
 * the list used to open filtered to the current week "with nothing on screen
 * saying so", which "looked like a data or permissions fault and was neither".
 * This is the sentence that was missing.
 */

export interface AppointmentFilterState {
  /**
   * The saved view's name, when that view carries conditions of its own.
   *
   * Without it an empty list read "No appointments found" while a view was
   * quietly filtering it - the same fault as the hidden chips, one level up.
   * A saved view's conditions are not shown on the chip row at all, so the
   * name is the only thing that can account for them.
   */
  viewName?: string;
  datePreset: string;
  /** Labels for the date presets, so the empty row and the panel cannot drift. */
  datePresetLabel?: (key: string) => string | undefined;
  doctorNames?: string[];
  status?: string;
  visitStatus?: string;
  search?: string;
}

const named = (value: string | null | undefined): string => (value ?? "").trim();

/**
 * One label per active filter, in the order the filter panel shows them.
 *
 * "all" and empty are not filters and never appear - a list showing everything
 * has nothing to explain.
 */
export function activeAppointmentFilters(state: AppointmentFilterState): string[] {
  const labels: string[] = [];

  const view = named(state.viewName);
  if (view) labels.push(view);

  const preset = named(state.datePreset);
  if (preset && preset !== "all") {
    labels.push(state.datePresetLabel?.(preset) || preset);
  }

  for (const doctor of state.doctorNames ?? []) {
    const name = named(doctor);
    if (name) labels.push(name);
  }

  const status = named(state.status);
  if (status && status !== "all") labels.push(status);

  const visitStatus = named(state.visitStatus);
  if (visitStatus && visitStatus !== "all") labels.push(visitStatus);

  const search = named(state.search);
  if (search) labels.push(`“${search}”`);

  return labels;
}

/** "No appointments match Today · Dr Punya Suvarna", or the plain line. */
export function emptyAppointmentsMessage(filters: string[]): string {
  return filters.length === 0
    ? "No appointments found"
    : `No appointments match ${filters.join(" · ")}`;
}
