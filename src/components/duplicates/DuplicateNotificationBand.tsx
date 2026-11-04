import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CalendarPlus, Merge, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getObject } from "@/lib/validation/schema";
import { recordLabel, type DuplicateMatch } from "@/lib/duplicates/engine";

interface Props {
  matches: DuplicateMatch[];
  objectKey: string;
  className?: string;
  onIgnore?: () => void;
  onCreateAppointment?: (record: Record<string, any>) => void;
  onResolve?: (record: Record<string, any>) => void;
}

const routeFor = (objectKey: string, id: string) => {
  switch (objectKey) {
    case "patients":
      return `/patients/${id}`;
    case "appointments":
      return `/appointments/${id}`;
    case "procedures":
      return `/procedures?open=${id}`;
    case "invoices":
      return `/billing?open=${id}`;
    default:
      return null;
  }
};

/**
 * Inline notification band shown directly inside the record form when a
 * duplicate is detected — renders the configured message and action buttons.
 */
export default function DuplicateNotificationBand({
  matches,
  objectKey,
  className,
  onIgnore,
  onCreateAppointment,
  onResolve,
}: Props) {
  const navigate = useNavigate();
  const obj = getObject(objectKey);
  if (!matches.length) return null;

  // Always a warning. This used to turn red and badge itself "Save blocked"
  // when a rule said so, and the form then refused to save - which stranded
  // staff registering a family member on a number the clinic already holds.
  return (
    <div className={"rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-3 " + (className || "")}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <span className="text-amber-700 dark:text-amber-400">
          {matches[0].title || "Possible duplicate found"}
        </span>
        <Badge variant="secondary" className="ml-auto">Warning</Badge>
        {onIgnore && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            aria-label="Dismiss duplicate warning"
            onClick={onIgnore}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {matches.map((m, i) => {
        const link = routeFor(objectKey, m.record.id);
        const actions = m.rule?.actions || [];
        return (
          <div key={`${m.rule?.id}-${m.record.id}-${i}`} className="space-y-2 rounded-md bg-background/60 p-2">
            <p className="text-xs">
              {m.message || `A similar record already exists: ${recordLabel(objectKey, m.record)}`}
            </p>
            {m.rule?.notification?.showMatchList !== false && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium">{recordLabel(objectKey, m.record)}</span>
                {m.matchedFields.map((f) => (
                  // A rule saved before duplicates became warning-only may still
                  // carry severity "block"; it no longer means anything, so the
                  // matched field is not painted as an error.
                  <Badge key={f.id} variant="secondary" className="text-[10px]">
                    {obj?.fields.find((x) => x.key === f.field_key)?.label || f.field_key}:{" "}
                    {String(m.record[f.field_key] ?? "—")}
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => {
                if (a.key === "open_record" && link) {
                  return (
                    <Button key={a.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate(link)}>
                      <ArrowRight className="h-3.5 w-3.5 mr-1" /> {a.label}
                    </Button>
                  );
                }
                if (a.key === "create_appointment" && objectKey === "patients") {
                  return (
                    <Button
                      key={a.key}
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        onCreateAppointment
                          ? onCreateAppointment(m.record)
                          : navigate(`/appointments?new=1&patientId=${m.record.id}`)
                      }
                    >
                      <CalendarPlus className="h-3.5 w-3.5 mr-1" /> {a.label}
                    </Button>
                  );
                }
                if (a.key === "merge" && onResolve) {
                  return (
                    <Button key={a.key} size="sm" variant="outline" className="h-7 text-xs" onClick={() => onResolve(m.record)}>
                      <Merge className="h-3.5 w-3.5 mr-1" /> {a.label}
                    </Button>
                  );
                }
                if (a.key === "ignore" && onIgnore) {
                  return (
                    <Button key={a.key} size="sm" variant="ghost" className="h-7 text-xs" onClick={onIgnore}>
                      {a.label}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
