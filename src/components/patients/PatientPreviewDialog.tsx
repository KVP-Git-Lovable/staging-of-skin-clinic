import { ExternalLink, UserCheck } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ageInYears } from "@/lib/knowledge";
import { shortPatientId } from "@/lib/utils";

/**
 * A suspected duplicate, shown WITHOUT leaving the form.
 *
 * ── Why this exists ──
 *
 * The duplicate warning on the Add Patient form used to be a plain
 * `navigate("/patients/<id>")`. `/patients` and `/patients/:id` are sibling
 * routes, so that unmounted the whole Patients page, which unmounted the
 * dialog, which destroyed every field the receptionist had typed. Coming back
 * landed on a fresh page with the form closed and empty. Nothing called close
 * - the route change alone did it.
 *
 * So the fix is not to navigate at all. This renders over the form, the form
 * stays mounted behind it, and closing this returns to a half-filled
 * registration exactly as it was.
 *
 * ── Why it takes a plain record and runs no query ──
 *
 * findDuplicates already does `.select("*")` (src/lib/duplicates/engine.ts),
 * so the match handed to the band carries every patient column. Fetching
 * again would add a spinner to a dialog whose entire job is to answer one
 * question quickly: is this the same person?
 */

export interface PreviewPatient {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  city?: string | null;
  status?: string | null;
  registered_at?: string | null;
  last_visit_date?: string | null;
}

const when = (value: string | null | undefined) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : format(d, "d MMM yyyy");
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      {/* An em dash, not an empty space: a blank looks like the dialog failed
          to load rather than like the clinic never recorded it. */}
      <p className="text-sm break-words">{value?.toString().trim() || "—"}</p>
    </div>
  );
}

export default function PatientPreviewDialog({
  patient,
  onClose,
  onUseInstead,
}: {
  patient: PreviewPatient | null;
  onClose: () => void;
  onUseInstead?: (patient: PreviewPatient) => void;
}) {
  if (!patient) return null;

  const name = [patient.first_name, patient.last_name].filter(Boolean).join(" ").trim();
  const age = ageInYears(patient.date_of_birth);
  const dob = when(patient.date_of_birth);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex flex-wrap items-center gap-2">
            {name || "Unnamed patient"}
            {patient.status && <Badge variant="secondary">{patient.status}</Badge>}
          </DialogTitle>
          {/* A real DialogDescription, not a loose <p>: without one Radix
              warns that the dialog has no accessible description, and a
              screen reader announces only the name. */}
          <DialogDescription className="text-xs">
            Existing patient {shortPatientId(patient.id)} · your form is still open behind this
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2">
          <Field label="Phone" value={patient.phone} />
          {/* The alternate number earns its place here: it is often the only
              thing that tells two family members on one number apart. */}
          <Field label="Alternate number" value={patient.alternate_phone} />
          <Field label="Date of birth" value={dob ? `${dob}${age !== null ? ` (${age})` : ""}` : null} />
          <Field label="Gender" value={patient.gender} />
          <Field label="Email" value={patient.email} />
          <Field label="City" value={patient.city} />
          <Field label="Registered" value={when(patient.registered_at)} />
          <Field label="Last visit" value={when(patient.last_visit_date)} />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {onUseInstead && (
            <Button size="sm" onClick={() => onUseInstead(patient)}>
              <UserCheck className="h-4 w-4 mr-2" />
              This is the patient
            </Button>
          )}
          {/* window.open with a known URL, which is what src/lib/newTab.ts
              prescribes - reserveTab() is only for a URL that is not known
              until after an await. Opening a tab keeps this form alive too. */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/patients/${patient.id}`, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Open full record
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Back to the form
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
