import { useNavigate } from "react-router-dom";
import { AlertTriangle, ShieldAlert, ArrowRight, CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getObject } from "@/lib/validation/schema";
import { recordLabel, type DuplicateMatch } from "@/lib/duplicates/engine";

interface Props {
  open: boolean;
  matches: DuplicateMatch[];
  objectKey: string;
  onClose: () => void;
  /** Called when the user chooses to save anyway (only offered for alerts). */
  onIgnore?: () => void;
  /** Optional handler for "Create appointment for this patient". */
  onCreateAppointment?: (record: Record<string, any>) => void;
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

export default function DuplicateAlertDialog({
  open,
  matches,
  objectKey,
  onClose,
  onIgnore,
  onCreateAppointment,
}: Props) {
  const navigate = useNavigate();
  const obj = getObject(objectKey);
  const blocking = matches.some((m) => m.severity === "block");
  const first = matches[0];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {blocking ? (
              <ShieldAlert className="h-5 w-5 text-destructive" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            )}
            {first?.title || "Possible duplicate found"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {matches.map((m, i) => {
            const actions = m.rule.actions || [];
            const link = routeFor(objectKey, m.record.id);
            return (
              <Card key={`${m.rule.id}-${m.record.id}-${i}`} className="p-3 space-y-2">
                <p className="text-sm">{m.message || `A similar record already exists: ${recordLabel(objectKey, m.record)}`}</p>
                {m.rule.notification?.showMatchList !== false && (
                  <div className="rounded-md bg-muted/50 p-2 text-xs space-y-1">
                    <div className="font-medium">{recordLabel(objectKey, m.record)}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {m.matchedFields.map((f) => (
                        <Badge key={f.id} variant={f.severity === "block" ? "destructive" : "secondary"}>
                          {obj?.fields.find((x) => x.key === f.field_key)?.label || f.field_key}:{" "}
                          {String(m.record[f.field_key] ?? "—")}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {actions.map((a) => {
                    if (a.key === "open_record" && link) {
                      return (
                        <Button key={a.key} size="sm" variant="outline" onClick={() => { onClose(); navigate(link); }}>
                          <ArrowRight className="h-4 w-4 mr-1" /> {a.label}
                        </Button>
                      );
                    }
                    if (a.key === "create_appointment" && objectKey === "patients") {
                      return (
                        <Button
                          key={a.key}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onClose();
                            if (onCreateAppointment) onCreateAppointment(m.record);
                            else navigate(`/appointments?new=1&patientId=${m.record.id}`);
                          }}
                        >
                          <CalendarPlus className="h-4 w-4 mr-1" /> {a.label}
                        </Button>
                      );
                    }
                    if (a.key === "ignore" && m.severity !== "block") {
                      return (
                        <Button key={a.key} size="sm" variant="ghost" onClick={() => { onClose(); onIgnore?.(); }}>
                          {a.label}
                        </Button>
                      );
                    }
                    return null;
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            {blocking ? "Back to form" : "Cancel"}
          </Button>
          {!blocking && onIgnore && (
            <Button onClick={() => { onClose(); onIgnore(); }}>Save anyway</Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
