import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mark that says the front desk should recognise this patient.
 *
 * Deliberately not the engagement tier sitting next to it on the patient page.
 * That one is computed from visits and spend and answers "how much has this
 * patient been worth"; this one is a judgement somebody made on purpose, and a
 * doctor's mother is VIP on her first visit and will never be Platinum. Gold
 * and a crown, so the two never read as the same thing.
 *
 * One component, used on the patient header, the appointment list, the calendar
 * block and the appointment sheet, so the mark cannot come to mean different
 * things on different screens.
 *
 * `shimmer` is for the one-of-a-kind surfaces - a patient header, an open
 * appointment - never for a list. Fifty animated pills in a day's appointments
 * is fifty compositor layers on a clinic PC, and the still badge is already the
 * only gold thing on the row.
 *
 * Nothing inside a list page sweeps, including its own detail pane: the split
 * view shows the selected row and the detail heading side by side, and they are
 * the same patient, so one swept and one still would read as two different
 * marks on one screen. The sweep means you are on the record itself.
 */

interface VipBadgeProps {
  /** Catches the eye once on arrival, then a slow sweep. Single surfaces only. */
  shimmer?: boolean;
  /** `icon` is the crown alone, for the compact calendar blocks. */
  size?: "icon" | "sm" | "md";
  className?: string;
}

export function VipBadge({ shimmer = false, size = "sm", className }: VipBadgeProps) {
  const label = size === "icon" ? null : <span>VIP</span>;
  return (
    <span
      // The whole badge is one label: a screen reader should not read a lone
      // crown, and on the icon-only size there is no text to read at all.
      role="img"
      aria-label="VIP patient"
      title="VIP patient"
      className={cn(
        "vip-badge inline-flex items-center shrink-0 rounded-full border font-semibold",
        "border-[hsl(var(--vip-border))] bg-[hsl(var(--vip-surface))] text-[hsl(var(--vip-ink))]",
        size === "icon" && "h-4 w-4 justify-center p-0",
        size === "sm" && "gap-1 px-1.5 py-0.5 text-[10px] leading-none",
        size === "md" && "gap-1.5 px-2.5 py-1 text-xs leading-none",
        shimmer && "vip-badge-shimmer",
        className
      )}
    >
      <Crown
        aria-hidden
        className={cn("shrink-0", size === "md" ? "h-3.5 w-3.5" : "h-3 w-3")}
      />
      {label}
    </span>
  );
}
