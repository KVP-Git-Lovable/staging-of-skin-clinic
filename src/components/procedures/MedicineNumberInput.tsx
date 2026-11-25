import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseMedicineNumber } from "@/lib/medicineNumber";

interface Props {
  /** This medicine's place in the list, 1-based. Always what is printed on the document. */
  position: number;
  /** Called with the number the person typed, once they finish typing it. */
  onMove: (position: number) => void;
}

/**
 * The number of a medicine on a prescription, which the doctor can change.
 *
 * It replaces the plain "Medicine 1" caption, so there is one number on the
 * screen rather than two. Typing a different number moves the medicine to that
 * place and renumbers the others (see lib/medicineNumber.ts), which is also
 * what the printed document shows.
 *
 * The move happens when the box is left or Enter is pressed, not on every
 * keystroke: typing "12" would otherwise jump the medicine to 1 on the way.
 * Something that is not a whole number goes back to what it was.
 */
export function MedicineNumberInput({ position, onMove }: Props) {
  const [draft, setDraft] = useState(String(position));

  // The number can change underneath us - another medicine was moved, or one
  // was removed - so follow it whenever it does.
  useEffect(() => {
    setDraft(String(position));
  }, [position]);

  const commit = () => {
    const typed = parseMedicineNumber(draft);
    if (typed === null || typed === position) {
      setDraft(String(position));
      return;
    }
    onMove(typed);
  };

  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
      Medicine no.
      <Input
        type="text"
        inputMode="numeric"
        aria-label="Medicine number"
        className="h-7 w-14 px-1 text-center text-sm font-semibold text-foreground"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Enter must not submit the whole prescription form.
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
