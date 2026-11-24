import { forwardRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { clampNumber, commitDraft, displayNumber, parseDraft } from "@/lib/numberField";

interface NumberFieldProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "min" | "max" | "type"> {
  /** The stored number. Always a number - 0 is a value, not an absence. */
  value: number;
  /** Called only when what is in the box IS a number. */
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  /**
   * What an empty box becomes when focus leaves. Defaults to `min`, or 0.
   *
   * Worth setting deliberately: 0 for a limit where 0 means "no limit", the
   * current year for a year, 75 for a threshold whose documented default is
   * 75. It is the answer to "they cleared it and walked away".
   */
  emptyValue?: number;
}

/**
 * A number box you can actually empty.
 *
 * While somebody is typing, what they typed is held as text - "" and "-" and
 * "1." are halfway states that no number can represent, and destroying them
 * is the bug this exists to fix. onChange fires only when the text is a
 * number, so clearing the box writes nothing; blur resolves whatever is left.
 *
 * Drops in where an <Input type="number"> is today: it forwards its ref and
 * spreads the rest, so className, disabled, data-testid, aria-label and
 * placeholder all behave as they did.
 */
export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onChange, min, max, emptyValue, onBlur, ...rest },
  ref,
) {
  // null means "no edit in hand, show the stored value". "" is an edit.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <Input
      {...rest}
      ref={ref}
      type="number"
      min={min}
      max={max}
      value={displayNumber(value, draft)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = parseDraft(raw);
        // An empty or halfway box writes nothing. That is the whole fix:
        // nothing is committed while the edit is still in progress, so
        // React has no new value to paint back over the keystroke.
        if (parsed.ok) onChange(clampNumber(parsed.value, { min, max }));
      }}
      onBlur={(e) => {
        if (draft !== null) {
          const settled = commitDraft(draft, { min, max, emptyValue });
          setDraft(null);
          if (settled !== value) onChange(settled);
        }
        onBlur?.(e);
      }}
    />
  );
});

export default NumberField;
