import type { ViewFilters } from "@/lib/listViews/engine";

/**
 * The quick-date chip a saved view implies, so the two date filters agree.
 *
 * The Appointments list has two of them. The chip row decides what is FETCHED
 * from the server; a view's own conditions then narrow that result client-side.
 * When they disagree the chip wins, quietly - a view whose date condition is
 * wider than the chip loses rows the server never asked for. Reading the chip
 * off the view removes the disagreement.
 *
 * The two vocabularies were already almost the same: dateRangeFor() in
 * listViews/engine.ts uses the same operator keys as the chip presets.
 */

/** Operators a chip can express exactly. */
const DIRECT: Record<string, string> = {
  today: "today",
  tomorrow: "tomorrow",
  yesterday: "yesterday",
  this_week: "this_week",
  last_week: "last_week",
  next_week: "next_week",
  this_month: "this_month",
};

export interface ViewDatePreset {
  preset: string;
  specificDate?: Date;
  rangeFrom?: Date;
  rangeTo?: Date;
}

const asDate = (value?: string): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/**
 * What the chips should show for this view, or null to leave them alone.
 *
 * Returns "all" - not the closest-looking chip - whenever the view's date
 * window cannot be expressed exactly. Fetching everything and letting the view
 * filter it client-side is always correct; guessing a narrower chip silently
 * drops rows the view wanted. That applies to:
 *
 *   - operators with no chip (last_month, the quarter and year ones,
 *     last_n_days, before, after);
 *   - match: "any", where a date condition does not bound the result at all
 *     because a row outside it can still match on another condition;
 *   - more than one date condition, whose intersection is not one chip.
 */
export function viewDatePreset(
  filters: ViewFilters | null | undefined,
  dateField = "start_time",
): ViewDatePreset | null {
  // A view with no filters at all - the standard "All …" and "Recently Viewed",
  // or a custom view nobody has given conditions yet - means everything, so the
  // chips must say so. Without this, picking "All Appointments" left yesterday's
  // Today chip in place and showed one day under a view named for all of them.
  if ((filters?.conditions ?? []).length === 0) return { preset: "all" };

  const conditions = (filters?.conditions ?? []).filter((c) => c?.field === dateField && c?.operator);
  // Conditions, but none about dates: the view says nothing about the date, so
  // leave whatever the user picked. Throwing away their date filter because they
  // switched to a status-based view would be its own bug.
  if (conditions.length === 0) return null;
  if (conditions.length > 1) return { preset: "all" };
  if (filters?.match === "any") return { preset: "all" };

  const [condition] = conditions;

  const direct = DIRECT[condition.operator];
  if (direct) return { preset: direct };

  if (condition.operator === "on") {
    const on = asDate(condition.value);
    // An unparseable date would leave the chip claiming a date it cannot show.
    return on ? { preset: "specific", specificDate: on } : { preset: "all" };
  }

  if (condition.operator === "between") {
    const from = asDate(condition.value);
    const to = asDate(condition.value2);
    if (!from || !to) return { preset: "all" };
    return from <= to
      ? { preset: "range", rangeFrom: from, rangeTo: to }
      : { preset: "range", rangeFrom: to, rangeTo: from };
  }

  return { preset: "all" };
}
