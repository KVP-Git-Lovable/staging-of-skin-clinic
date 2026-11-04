import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * A small copy-to-clipboard control.
 *
 * Front desk were retyping an investigation from a patient's last visit when
 * booking the next one. The first home for this is the Investigation column on
 * the patient's Appts tab, and two things about that spot are worth building in
 * rather than leaving to each caller:
 *
 *  - The table row it sits in opens the appointment when clicked. A button
 *    inside it inherits that, so without stopping the event, copying would also
 *    throw the appointment sheet over the list being worked from. The next
 *    place this lands will almost certainly be another clickable row.
 *
 *  - Nothing to copy means no button. An investigation is blank on plenty of
 *    visits, and a button that copies the "—" the cell shows is worse than no
 *    button at all: the dash gets pasted into the next appointment and nobody
 *    notices.
 *
 * The app had four hand-rolled clipboard calls and no shared control; three of
 * them have no catch, and writeText rejects outright outside a secure context.
 */
interface CopyButtonProps {
  /** What goes on the clipboard. Blank means no button is rendered. */
  value: string | null | undefined;
  /** Names the thing being copied, for the toast and for screen readers. */
  label?: string;
  className?: string;
}

/** How long the tick stays, so a silent clipboard still looks like it worked. */
const COPIED_MS = 1500;

export function CopyButton({ value, label = "text", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const text = String(value ?? "").trim();
  if (!text) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={`Copy ${label}`}
      className={cn("h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground", className)}
      onClick={async (e) => {
        // The row behind this one opens a record; copying must not also do that.
        e.stopPropagation();
        e.preventDefault();
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), COPIED_MS);
          toast.success(`${label.charAt(0).toUpperCase()}${label.slice(1)} copied`);
        } catch {
          // Refused rather than copied - say so instead of showing a tick.
          toast.error("Could not copy - your browser blocked the clipboard.");
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

export default CopyButton;
