import { useState, type ReactNode } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A date picker that closes once a date is picked.
 *
 * Every calendar in the app was written out by hand as an uncontrolled
 * `<Popover>` wrapping a `<Calendar>`, and an uncontrolled popover has no way
 * to shut itself: nothing in `onSelect` could close it, so picking a date left
 * the month grid sitting over the page until you clicked elsewhere. Twelve of
 * the thirteen behaved that way. The clinic reported it on the reports filter.
 *
 * Holding the open state is the whole fix, and holding it in one place is what
 * stops the next date picker being written with the same gap.
 *
 * The markup is deliberately the same as the hand-written blocks it replaces -
 * same Popover, same `w-auto p-0` content, same calendar classes - so this
 * changes when the calendar closes and nothing about how it looks.
 */
interface CalendarPopoverProps {
  /** The button that opens it. Rendered through `asChild`, as before. */
  trigger: ReactNode;
  selected?: Date;
  /**
   * Given exactly what react-day-picker gives, `undefined` included.
   *
   * Clicking the day that is already selected deselects it, and callers like
   * `onSelect={setStartDate}` rely on that to clear a date back to "Pick a
   * date". Narrowing this to a real date would quietly take that away.
   */
  onSelect: (date: Date | undefined) => void;
  align?: "start" | "center" | "end";
  /** Forwarded to the calendar - the appointment start date disables the past. */
  disabled?: React.ComponentProps<typeof Calendar>["disabled"];
  /** Forwarded to the calendar - e.g. marking days that have appointments. */
  modifiers?: React.ComponentProps<typeof Calendar>["modifiers"];
  modifiersClassNames?: React.ComponentProps<typeof Calendar>["modifiersClassNames"];
  contentClassName?: string;
}

export function CalendarPopover({
  trigger,
  selected,
  onSelect,
  align = "start",
  disabled,
  modifiers,
  modifiersClassNames,
  contentClassName,
}: CalendarPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className={cn("w-auto p-0", contentClassName)} align={align}>
        <Calendar
          mode="single"
          selected={selected}
          // Open on the month already chosen rather than on today, so editing a
          // date set months ago does not start with paging backwards.
          defaultMonth={selected}
          disabled={disabled}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          onSelect={(date) => {
            onSelect(date);
            setOpen(false);
          }}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
      </PopoverContent>
    </Popover>
  );
}
