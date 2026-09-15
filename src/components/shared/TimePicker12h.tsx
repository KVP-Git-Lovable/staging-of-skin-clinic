import { useState } from "react";
import { Clock } from "lucide-react";
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
  const parsed = parse24h(value);
  const isSet = !!parsed;
  const hour12 = parsed?.hour12 ?? 9;
  const minute = parsed?.minute ?? 0;
  const period = parsed?.period ?? "AM";

  // While typing, the box holds the raw digits the user entered so mid-typing
  // states ("1" on the way to "10") aren't rewritten under the cursor.
  const [hourDraft, setHourDraft] = useState<string | null>(null);
  const [minuteDraft, setMinuteDraft] = useState<string | null>(null);

  const update = (patch: Partial<{ hour12: number; minute: number; period: "AM" | "PM" }>) => {
    onChange(to24h(patch.hour12 ?? hour12, patch.minute ?? minute, patch.period ?? period));
  };

  const digits = (s: string) => s.replace(/\D/g, "").slice(0, 2);

  const onHourInput = (raw: string) => {
    const d = digits(raw);
    setHourDraft(d);
    if (d === "") {
      onChange(""); // clearing the box clears the value (e.g. optional break times)
      return;
    }
    const n = Number(d);
    if (n >= 1 && n <= 12) update({ hour12: n });
  };

  const onMinuteInput = (raw: string) => {
    const d = digits(raw);
    setMinuteDraft(d);
    if (d === "") {
      onChange("");
      return;
    }
    const n = Number(d);
    if (n >= 0 && n <= 59) update({ minute: n });
  };

  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center gap-1 overflow-hidden rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        compact ? "h-8" : "h-10",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
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
        className="w-8 shrink-0 bg-transparent text-center outline-none"
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
        className="w-9 shrink-0 bg-transparent text-center outline-none"
      />

      {/* Two-state AM/PM toggle button, not text labels - the active side is filled. */}
      <div className={cn("ml-auto flex shrink-0 overflow-hidden rounded border border-input text-[10px] font-semibold")}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => update({ period: "AM" })}
          className={cn(
            "px-1.5 py-0.5 transition-colors",
            period === "AM" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted",
          )}
        >
          AM
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => update({ period: "PM" })}
          className={cn(
            "px-1.5 py-0.5 transition-colors border-l border-input",
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
