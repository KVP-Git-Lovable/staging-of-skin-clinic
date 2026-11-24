import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { investigationText } from "@/lib/investigationText";
import { visitNotes, visitStaffName, type VisitRow } from "@/lib/patientVisitHistory";
import { withDrPrefix } from "@/lib/staffName";

/**
 * One earlier visit, read-only.
 *
 * Opened from the Previous Appointments tab for a visit the signed-in user
 * may read about but not open: a therapist is scoped to the visits she was
 * put on, so the full detail sheet would load nothing for her (it uses
 * maybeSingle(), which returns null rather than erroring on a hidden row).
 *
 * She still needs what is here before she treats the patient again - the
 * investigation, what was done, and the notes written at the time - which is
 * exactly what the clinic asked for.
 *
 * Read-only on purpose. There is nothing to save, and no amounts: this is fed
 * by patient_visit_history/patient_visit_notes, neither of which touches
 * invoices.
 */
export function PastVisitSheet({ visit, anchorAppointmentId, onClose }: {
  visit: VisitRow | null;
  anchorAppointmentId: string;
  onClose: () => void;
}) {
  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["past-visit-notes", anchorAppointmentId, visit?.id],
    enabled: !!visit?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("patient_visit_notes", {
        p_appointment_id: anchorAppointmentId,
        p_visit_id: visit!.id,
      });
      if (error) throw error;
      return visitNotes(data);
    },
  });

  const staffName = visit ? visitStaffName(visit) : "";
  // The heading already shows the investigation when there is one, so the
  // field below would repeat it word for word.
  const heading = visit ? investigationText(visit, visit.service || "Consultation") : "";
  const showInvestigation = !!visit?.reason_for_consultation
    && visit.reason_for_consultation.trim() !== heading.trim();

  return (
    <Sheet open={!!visit} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        {visit && (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="font-display">
                {heading}
              </SheetTitle>
              <p className="text-sm text-muted-foreground">
                {format(new Date(visit.start_time), "EEE, d MMM yyyy · h:mm a")}
                {staffName && ` · ${withDrPrefix(staffName)}`}
              </p>
            </SheetHeader>

            <div className="mt-6 space-y-5">
              <div className="flex flex-wrap gap-2">
                {visit.status && <Badge variant="outline">{visit.status}</Badge>}
                {visit.visit_status && <Badge variant="outline">{visit.visit_status}</Badge>}
                {visit.appointment_type && <Badge variant="outline">{visit.appointment_type}</Badge>}
              </div>

              {visit.service && (
                <div className="space-y-1">
                  <Label className="text-xs">Service</Label>
                  <p className="text-sm">{visit.service}</p>
                </div>
              )}

              {showInvestigation && (
                <div className="space-y-1">
                  <Label className="text-xs">Investigation</Label>
                  <p className="text-sm whitespace-pre-wrap">{visit.reason_for_consultation}</p>
                </div>
              )}

              {visit.consultation_type && (
                <div className="space-y-1">
                  <Label className="text-xs">Consultation type</Label>
                  <p className="text-sm">{visit.consultation_type}</p>
                </div>
              )}

              {visit.consultation_reasons?.length ? (
                <div className="space-y-1">
                  <Label className="text-xs">Reasons</Label>
                  <div className="flex flex-wrap gap-1">
                    {visit.consultation_reasons.map((reason) => (
                      <Badge key={reason} variant="secondary" className="text-xs">{reason}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2 border-t pt-4">
                <Label className="text-xs flex items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5" /> Notes
                </Label>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading notes…
                  </p>
                ) : notes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing was written on this visit.</p>
                ) : (
                  <div className="space-y-2">
                    {notes.map((note) => (
                      <div key={note.id} className="rounded-lg border bg-muted/30 p-3">
                        {note.title && <p className="text-sm font-medium">{note.title}</p>}
                        {note.content && (
                          <p className="text-sm mt-1 whitespace-pre-wrap">{note.content}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          {[note.author_first_name, note.author_last_name].filter(Boolean).join(" ")}
                          {note.created_at && ` · ${format(new Date(note.created_at), "d MMM yyyy")}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
