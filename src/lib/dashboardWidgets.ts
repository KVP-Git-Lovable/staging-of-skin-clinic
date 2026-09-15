/** Salesforce-style dashboard widget presentation options. */
export interface WidgetOptions {
  subtitle?: string;
  footer?: string;
  legend_position?: "right" | "bottom" | "none";
  theme?: "light" | "dark";
  display_units?: "full" | "shortened";
  decimals?: "auto" | "0" | "1" | "2";
  max_groups?: number;
  sort_by?: "none" | "label_asc" | "label_desc" | "value_asc" | "value_desc";
  /** "record_count" or a numeric field key (object.field) for Summary Number widgets. */
  measure?: string;
  custom_link?: string;
  show_view_report?: boolean;
}

export const DEFAULT_WIDGET_OPTIONS: WidgetOptions = {
  subtitle: "",
  footer: "",
  legend_position: "right",
  theme: "light",
  display_units: "full",
  decimals: "auto",
  max_groups: 100,
  sort_by: "none",
  measure: "record_count",
  custom_link: "",
  show_view_report: true,
};

export const mergeWidgetOptions = (config: any): WidgetOptions => ({
  ...DEFAULT_WIDGET_OPTIONS,
  ...(config && typeof config === "object" ? config : {}),
});

export const LEGEND_POSITIONS = [
  { key: "right", label: "Right" },
  { key: "bottom", label: "Bottom" },
  { key: "none", label: "None" },
];

export const SORT_OPTIONS = [
  { key: "none", label: "Report order" },
  { key: "label_asc", label: "Label — A to Z" },
  { key: "label_desc", label: "Label — Z to A" },
  { key: "value_asc", label: "Value — Low to High" },
  { key: "value_desc", label: "Value — High to Low" },
];

/** Formats a metric respecting display units and decimal places. */
export function formatMetric(value: number, opts: WidgetOptions): string {
  const decimals = opts.decimals && opts.decimals !== "auto" ? parseInt(opts.decimals, 10) : undefined;
  if (opts.display_units === "shortened") {
    const abs = Math.abs(value);
    const units: [number, string][] = [
      [1_000_000_000, "B"],
      [1_000_000, "M"],
      [1_000, "K"],
    ];
    for (const [size, suffix] of units) {
      if (abs >= size) {
        const short = value / size;
        return `${short.toFixed(decimals ?? (Math.abs(short) >= 100 ? 0 : 1))}${suffix}`;
      }
    }
  }
  return value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
  });
}

/** Applies widget sorting + max-groups limiting to chart data. */
export function applyWidgetShaping<T extends { name: string }>(
  rows: T[],
  valueKey: string,
  opts: WidgetOptions
): T[] {
  let out = [...rows];
  switch (opts.sort_by) {
    case "label_asc":
      out.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "label_desc":
      out.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "value_asc":
      out.sort((a: any, b: any) => (Number(a[valueKey]) || 0) - (Number(b[valueKey]) || 0));
      break;
    case "value_desc":
      out.sort((a: any, b: any) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0));
      break;
    default:
      break;
  }
  const max = Number(opts.max_groups) || 0;
  if (max > 0 && out.length > max) out = out.slice(0, max);
  return out;
}
