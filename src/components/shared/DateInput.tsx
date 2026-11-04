import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { CalendarPopover } from "./CalendarPopover";
import { cn } from "@/lib/utils";
import { displayToIso, isoToDisplay, maskTyping } from "@/lib/dateInput";

interface DateInputProps {
  /** The stored date, ISO yyyy-MM-dd, or "" when there isn't one. */
  value: string;
  /** Called with a complete ISO date, or "" when the box is emptied. */
  onChange: (iso: string) => void;
  id?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  /**
   * Show a calendar button that opens a month view, as booking an appointment
   * does. Off by default so every existing date box stays exactly as it is.
   */
  withCalendar?: boolean;
  /**
   * Classes for the input itself.
   *
   * `className` sizes the wrapper once there is a calendar button to sit
   * inside it, which is right for a width but leaves no way to make the box
   * shorter - a compact filter bar wants h-8 text-xs on the input, and
   * putting that on the wrapper only moves the button. This reaches the box
   * in both layouts.
   */
  inputClassName?: string;
}

/** Local yyyy-MM-dd. Not toISOString(), which is UTC and lands on the day before. */
function toIsoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Midday, so no timezone shift can tip the calendar onto an adjacent day. */
function fromIsoDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
}

/**
 * A date field that reads and accepts dd/MM/yyyy on every machine.
 *
 * Replaces `<input type="date">`, which the browser paints in the viewer's own
 * region setting - the reason one clinic PC showed a patient as 07/31/1982 and
 * another 31/07/1982. It speaks the same ISO yyyy-MM-dd to its caller that the
 * native input did, so nothing downstream changes.
 *
 * The typed text is held locally and only handed upwards once it parses. Writing
 * the converted value straight back on every keystroke is what makes a field of
 * this kind impossible to type in: the text is reformatted mid-edit and the
 * caret jumps to the end. (Same shape of bug as the Paid Amount zero-trap that
 * `@/lib/numberInput` exists to avoid.)
 *
 * With `withCalendar` it also offers the month view used when booking, so
 * rescheduling is a click rather than eight digits. The box stays typeable -
 * front desk are quicker at typing a date they already know than at paging a
 * calendar to it.
 */
export function DateInput({
  value,
  onChange,
  id,
  className,
  placeholder = "dd/mm/yyyy",
  required,
  withCalendar = false,
  inputClassName,
}: DateInputProps) {
  const [text, setText] = useState(() => isoToDisplay(value));

  // Re-sync only when the incoming date is not the one already on screen, so a
  // reset from outside still lands while a half-typed date is never yanked out
  // from under the caret.
  useEffect(() => {
    if (displayToIso(text) !== (value || null)) setText(isoToDisplay(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const field = (
    <Input
      id={id}
      className={withCalendar ? cn("w-full pr-9", inputClassName) : cn(className, inputClassName)}
      required={required}
      value={text}
      inputMode="numeric"
      placeholder={placeholder}
      onChange={(e) => {
        const next = maskTyping(e.target.value);
        setText(next);
        const iso = displayToIso(next);
        if (iso) onChange(iso);
        else if (next === "") onChange("");
      }}
      onBlur={() => {
        // A date left half-typed would show one thing while a different one got
        // saved, so on leaving the field the text snaps back to what is stored.
        if (text !== "" && displayToIso(text) === null) setText(isoToDisplay(value));
      }}
    />
  );

  if (!withCalendar) return field;

  const selected = fromIsoDate(value);

  return (
    <div className={cn("relative", className)}>
      {field}
      <CalendarPopover
        selected={selected}
        align="end"
        onSelect={(date) => {
          // Typed text and stored value move together; an empty pick is
          // ignored here rather than wiping a date the box still shows.
          if (!date) return;
          const iso = toIsoDate(date);
          setText(isoToDisplay(iso));
          onChange(iso);
        }}
        trigger={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Open calendar"
            className="absolute right-0 top-0 h-full w-9 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        }
      />
    </div>
  );
}
