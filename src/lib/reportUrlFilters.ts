/**
 * Opening a report already filtered, from a link.
 *
 * The dashboard's feedback card sends the clinic straight to the Patient
 * Feedback report for one NPS band - the seven detractors are the patients
 * worth ringing, and making someone re-pick the band and the dates on arrival
 * is how a dashboard card stops being used.
 *
 * Deliberately narrow: only the report's own `select` filters can be set this
 * way, so a link cannot invent a filter the report does not have, and anything
 * unrecognised is ignored rather than refused. A report opened with no
 * parameters is untouched.
 */

export interface UrlFilterable {
  key: string;
  type: string;
}

export interface ReportUrlOverrides {
  dateFrom?: Date;
  dateTo?: Date;
  datePreset?: string;
  customStart?: string;
  customEnd?: string;
  selects?: Record<string, string>;
}

const asDate = (value: string | null, endOfTheDay: boolean): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(`${value}T${endOfTheDay ? "23:59:59" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

export function reportFiltersFromUrl(
  params: URLSearchParams,
  filters: UrlFilterable[] = [],
): ReportUrlOverrides | null {
  const overrides: ReportUrlOverrides = {};

  const from = asDate(params.get("from"), false);
  const to = asDate(params.get("to"), true);
  if (from && to) {
    overrides.dateFrom = from;
    overrides.dateTo = to;
    overrides.datePreset = "custom";
    overrides.customStart = params.get("from") as string;
    overrides.customEnd = params.get("to") as string;
  }

  const selects: Record<string, string> = {};
  for (const filter of filters) {
    if (filter.type !== "select") continue;
    const value = params.get(filter.key);
    if (value) selects[filter.key] = value;
  }
  if (Object.keys(selects).length > 0) overrides.selects = selects;

  return Object.keys(overrides).length > 0 ? overrides : null;
}
