import { Eye, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PdfPreviewDialog } from "@/components/shared/PdfPreviewDialog";
import { usePrescriptionPreview } from "@/hooks/usePrescriptionPreview";

interface Props {
  procedureId: string;
  /** "icon" for a table row or card; "full" where there is room for a label. */
  variant?: "icon" | "full";
  /**
   * "view" opens the prescription to be read; "print" sends it straight to the
   * printer. Both build the same document by the same route - print only says
   * up front what is wanted with it, so the front desk does not have to open
   * the record, then the preview, then press Print.
   */
  action?: "view" | "print";
  className?: string;
}

/**
 * Read, or print, a prescription from the row that lists it.
 *
 * The lists it sits in - the patient's Prescriptions tab, an appointment's
 * Previous Prescriptions, the Prescriptions list itself - open the whole visit
 * when a row is clicked, which is right when the doctor means to change
 * something and a long way round when they only want to read what was written
 * or put it on paper. It stops its own click reaching the row for that reason:
 * tapping the eye must not also open the editor behind it.
 */
export function ViewPrescriptionButton({
  procedureId,
  variant = "icon",
  action = "view",
  className,
}: Props) {
  const preview = usePrescriptionPreview(procedureId);
  const printing = action === "print";
  const label = printing ? "Print prescription" : "View prescription";
  const Icon = printing ? Printer : Eye;

  /** Shared by the three events a row can be opened by. */
  const stopHere = (e: React.SyntheticEvent) => e.stopPropagation();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void preview.preview();
  };

  return (
    <>
      <Button
        type="button"
        variant={variant === "icon" ? "ghost" : "outline"}
        size={variant === "icon" ? "icon" : "sm"}
        className={variant === "icon" ? `h-8 w-8 ${className ?? ""}` : `gap-1.5 text-xs ${className ?? ""}`}
        title={label}
        aria-label={label}
        onClick={onClick}
        disabled={preview.previewing}
      >
        {preview.previewing
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Icon className="h-4 w-4" />}
        {variant === "full" && <span>{label}</span>}
      </Button>

      {/* Inside the button's own tree, so a list of twenty rows still has one
          dialog open at a time - whichever was asked for.

          Wrapped because a React portal is not where it looks. Radix moves the
          dialog to the end of the body, but events still travel up the REACT
          tree, so closing it - the X, or a click on the backdrop - reached the
          row this button sits in and opened the visit behind it. Reported as
          "when we click on that close button or click somewhere outside it
          takes to other page". The wrapper is the boundary: handlers inside the
          dialog have already run by the time it stops them going further. */}
      <span onClick={stopHere} onMouseDown={stopHere} onPointerDown={stopHere}>
      <PdfPreviewDialog
        open={preview.open}
        onClose={preview.close}
        title={printing ? "Print prescription" : "Prescription preview"}
        preparing="Preparing the prescription…"
        pages={preview.pages}
        error={preview.error}
        onRetry={preview.preview}
        onDownload={preview.download}
        downloading={preview.downloading}
        autoPrint={printing}
      />
      </span>
    </>
  );
}
