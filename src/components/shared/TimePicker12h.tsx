import { useState } from "react";
import { cn } from "@/lib/utils";

interface TimePicker12hProps {
  /** 24hr "HH:mm" string (e.g. "14:30"), same shape <input type="time"> uses. */
  value: string;
  /** Called with a 24hr "HH:mm" string - callers don't need to change anything else. */
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
  /** Smaller footprint for dense contexts like a table row. */
  compact?: boolean;
}

function parse24h(value: string) {
  const [hStr, mStr] = (value || "").split(":");
  const h24 = Number(hStr);
  const minute = Number(mStr);
  if (Number.isNaN(h24) || Number.isNaN(minute)) return null;
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period };
}

function to24h(hour12: number, minute: number, period: "AM" | "PM") {
  const h24 = period === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Clamps into [1,12] - never wraps, so typing can't silently pick another hour. */
function clampHour(h: number) {
  if (Number.isNaN(h)) return 12;
  return Math.min(12, Math.max(1, h));
}

/** Clamps into [0,59]. */
function clampMinute(m: number) {
  if (Number.isNaN(m)) return 0;
  return Math.min(59, Math.max(0, m));
}

/**
 * <input type="time"> renders in whatever 24hr/12hr format the visitor's
 * OS/browser locale prefers - there's no HTML-level way to force 12hr with
 * an explicit AM/PM selector. This is a same-footprint replacement: plain
 * number spinners for hour/minute (native up/down arrows, type directly,
 * no popup list) plus a clearly-a-button two-state AM/PM toggle. Same
 * value/onChange contract (24hr "HH:mm" in, 24hr "HH:mm" out) so every
 * existing caller - including WhatsApp message building, which formats its
 * own Date independently of this input - needs no other changes.
 */
export function TimePicker12h({ value, onChange, className, disabled, compact }: TimePicker12hProps) {
  // While typing, the box holds the raw digits the user entered so mid-typing
  // states ("1" on the way to "10") aren't rewritten under the cursor.
  const [hourDraft, setHourDraft] = useState<string | null>(null);
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null);
  /**
   * Which side of noon was last asked for, kept for while there is no time to
   * read it off.
   *
   * period is normally derived from the value, and a cleared value has no
   * period - so it fell back to AM. Clear the boxes on a 2:30 PM appointment,
   * retype the hour, and it came back AM with nobody having touched the
   * toggle. This remembers what was chosen until there is a real time again.
   */
  const [periodDraft, setPeriodDraft] = useState<"AM" | "PM" | null>(null);

  const parsed = parse24h(value);
  const isSet = !!parsed;
  const hour12 = parsed?.hour12 ?? 9;
  const minute = parsed?.minute ?? 0;
  // periodDraft only ever speaks for a value that is not set; a real time
  // says which side of noon it is on itself.
  const period = parsed?.period ?? periodDraft ?? "AM";

  const update = (patch: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => {
    onChange(to24h(patch.hour12 ?? hour12, patch.minute ?? minute, patch.period ?? period));
  };

  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 2);

  /**
   * Emptying ONE box is somebody retyping that box, not clearing the time.
   *
   * Both boxes used to be drawn from a single stored value, and emptying
   * either one called onChange("") - which left nothing for the other box or
   * the AM/PM toggle to read, so all three went blank at once. Backspacing the
   * minutes on a 9:00 AM appointment wiped the hour as well, and retyping
   * from an empty value picked the defaults back up: the minute became :00 and
   * the side of noon became AM, whatever had been set before. That is both of
   * the things the front desk reported, from one line.
   *
   * So the stored time is only cleared once BOTH boxes are empty, which is
   * still a thing somebody may want (an optional break time). Until then the
   * emptied box shows blank from its own draft while the value underneath -
   * the other box, and the period - stays exactly as it was.
   */
  const clearIfBothEmpty = (otherDraft: string | null) => {
    if (otherDraft !== "" && isSet) return;
    setPeriodDraft(period);
    onChange("");
  };

  const onHourInput = (raw: string) => {
    const d = digits(raw);
    setHourDraft(d);
    if (d === "") {
      clearIfBothEmpty(minuteDraft);
      return;
    }
    const n = Number(d);
    if (n >= 1 && n <= 12) update({ hour12: n });
  };

  const onMinuteInput = (raw: string) => {
    const d = digits(raw);
    setMinuteDraft(d);
    if (d === "") {
      clearIfBothEmpty(hourDraft);
      return;
    }
    const n = Number(d);
    if (n >= 0 && n <= 59) update({ minute: n });
  };

  /**
   * AM/PM with no time typed yet records the side and nothing else.
   *
   * It used to convert through the value, and with no value that meant
   * inventing nine o'clock - a half-filled box quietly became a real
   * appointment time. The side is remembered instead and applied to whatever
   * hour gets typed next.
   */
  const choosePeriod = (next: "AM" | "PM") => {
    setPeriodDraft(next);
    if (isSet) update({ period: next });
  };

  return (
    <div
      // No overflow-hidden here. It used to have it, and when the control was
      // narrow - Start and End side by side inside a half-width column is
      // exactly narrow enough - the AM/PM toggle was the part pushed out, and
      // it was clipped away without a trace. The clinic reported PM as
      // missing; it had been rendered all along, just past the edge. Nothing
      // here may hide a control the user has to reach. The clock icon went
      // with it to buy back the width: every caller already labels the field
      // Start or End.
      className={cn(
        "flex w-full items-center justify-center gap-0.5 rounded-md border border-input bg-background px-1.5 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        // A floor wide enough for both digits and the AM/PM toggle. Without
        // one, a narrow caller squeezed the digits away to nothing - which is
        // what a table cell sized for reading "10:15 AM" did to it.
        compact ? "h-8 min-w-[7.5rem]" : "h-10 min-w-[8.5rem]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label="Hour"
        value={hourDraft ?? (isSet ? String(hour12) : "")}
        placeholder="--"
        disabled={disabled}
        onChange={(e) => onHourInput(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (hourDraft && hourDraft !== "") {
            const clamped = clampHour(Number(hourDraft));
            update({ hour12: clamped });
          }
          setHourDraft(null);
        }}
        className="w-7 shrink-0 bg-transparent text-center outline-none"
      />
      <span className="text-muted-foreground">:</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label="Minute"
        value={minuteDraft ?? (isSet ? String(minute).padStart(2, "0") : "")}
        placeholder="--"
        disabled={disabled}
        onChange={(e) => onMinuteInput(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (minuteDraft && minuteDraft !== "") {
            const clamped = clampMinute(Number(minuteDraft));
            update({ minute: clamped });
          }
          setMinuteDraft(null);
        }}
        className="w-8 shrink-0 bg-transparent text-center outline-none"
      />

      {/* Two-state AM/PM toggle button, not text labels - the active side is filled. */}
      <div className={cn("ml-auto flex shrink-0 rounded border border-input text-[10px] font-semibold")}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => choosePeriod("AM")}
          className={cn(
            "rounded-l-[3px] px-1.5 py-0.5 transition-colors",
            period === "AM" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          AM
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => choosePeriod("PM")}
          className={cn(
            "rounded-r-[3px] border-l border-input px-1.5 py-0.5 transition-colors",
            period === "PM" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          PM
        </button>
      </div>
    </div>
  );
}

export default TimePicker12h;
