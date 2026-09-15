import { formatMoney } from "@/lib/currency";
import { CalendarDays, IndianRupee, Repeat, Timer } from "lucide-react";

interface Props {
  patient: any;
  /** Live count of actual visits, overrides the stored roll-up when provided. */
  visitsOverride?: number;
  /** Live lifetime value (sum of invoices), overrides the stored roll-up. */
  lifetimeValueOverride?: number;
}

const tierStyles: Record<string, string> = {
  Platinum: "bg-violet-100 text-violet-700 border-violet-200",
  Gold: "bg-amber-100 text-amber-700 border-amber-200",
  Silver: "bg-slate-100 text-slate-600 border-slate-200",
  Early: "bg-emerald-50 text-emerald-600 border-emerald-200",
};

/**
 * Automated roll-up metrics for a patient. Values are calculated by the
 * engagement engine and stored on the patient record so they can also be
 * used in list views and reports.
 */
export function PatientEngagementRollups({ patient, visitsOverride, lifetimeValueOverride }: Props) {
  if (!patient) return null;

  const visits = visitsOverride ?? patient.total_visits;
  const ltv = lifetimeValueOverride ?? patient.lifetime_value;

  const items = [
    {
      icon: Repeat,
      label: "# of Visits",
      value: visits != null ? String(visits) : "—",
    },
    {
      icon: IndianRupee,
      label: "Lifetime Value",
      value:
        ltv != null ? formatMoney(Number(ltv)) : "—",
    },
    {
      icon: Timer,
      label: "Days Since Last Visit",
      value: patient.days_since_last_visit != null ? String(patient.days_since_last_visit) : "—",
    },
    {
      icon: CalendarDays,
      label: "Engagement Level",
      value: patient.engagement_tier || "—",
      badge: true,
    },
  ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="font-display text-sm font-semibold mb-3">Patient Engagement</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <it.icon className="h-3.5 w-3.5" />
              <span className="truncate">{it.label}</span>
            </div>
            {it.badge ? (
              <span
                className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  tierStyles[it.value] || "bg-muted text-muted-foreground"
                }`}
              >
                {it.value}
              </span>
            ) : (
              <p className="mt-1 text-base font-semibold tabular-nums">{it.value}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        Automatically calculated roll-ups — available in list views and reports.
      </p>
    </div>
  );
}
