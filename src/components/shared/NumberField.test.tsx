import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumberField } from "./NumberField";

/**
 * The reported bug, reproduced and then not reproduced.
 *
 * "Corrections allowed per month" showed 0 and the 0 could not be backspaced
 * away: Number("") is 0, so every keystroke that emptied the box re-filled
 * it, and typing 3 after the surviving 0 gave 30.
 *
 * Mirrors how AttendanceSettings holds the figure: a number in, a number out.
 */
function Harness({
  initial = 0, min, max, emptyValue, onValue,
}: {
  initial?: number; min?: number; max?: number; emptyValue?: number;
  onValue?: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <NumberField
        data-testid="field"
        value={value}
        min={min}
        max={max}
        emptyValue={emptyValue}
        onChange={(v) => { setValue(v); onValue?.(v); }}
      />
      <span data-testid="stored">{String(value)}</span>
    </>
  );
}

const field = () => screen.getByTestId("field") as HTMLInputElement;
const stored = () => screen.getByTestId("stored").textContent;

describe("NumberField", () => {
  it("shows a stored 0 as 0", () => {
    // Unlike numVal, which paints it as an empty box. Here 0 is an answer
    // somebody chose - "no limit" - not a missing one.
    render(<Harness initial={0} min={0} max={31} emptyValue={0} />);
    expect(field().value).toBe("0");
  });

  it("lets the 0 be backspaced away and stays empty", () => {
    render(<Harness initial={0} min={0} max={31} emptyValue={0} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(field().value).toBe("");
  });

  it("writes nothing while the box is empty", () => {
    // Nothing committed means nothing for React to paint back over the
    // keystroke. This is the fix, in one assertion.
    const onValue = vi.fn();
    render(<Harness initial={0} min={0} max={31} emptyValue={0} onValue={onValue} />);
    fireEvent.change(field(), { target: { value: "" } });
    expect(onValue).not.toHaveBeenCalled();
  });

  it("types 3 over a 0 and stores 3, not 30", () => {
    render(<Harness initial={0} min={0} max={31} emptyValue={0} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.change(field(), { target: { value: "3" } });
    expect(field().value).toBe("3");
    expect(stored()).toBe("3");
  });

  it("settles an empty box on blur", () => {
    render(<Harness initial={5} min={0} max={31} emptyValue={0} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(stored()).toBe("0");
    expect(field().value).toBe("0");
  });

  it("settles on the value chosen for empty, not always zero", () => {
    render(<Harness initial={90} min={0} max={100} emptyValue={75} />);
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.blur(field());
    expect(stored()).toBe("75");
  });

  it("holds a typed figure inside its bounds", () => {
    // The database CHECK behind this one is 0..31.
    render(<Harness initial={0} min={0} max={31} emptyValue={0} />);
    fireEvent.change(field(), { target: { value: "99" } });
    expect(stored()).toBe("31");
  });

  it("commits nothing for a halfway edit", () => {
    // A type="number" input reports "" for a value it cannot parse, so "1."
    // and "-" reach us as an empty box on the way to 1.5 and -3. Treating
    // that "" as zero is exactly the bug; it has to commit nothing instead.
    const onValue = vi.fn();
    render(<Harness initial={9} onValue={onValue} />);
    fireEvent.change(field(), { target: { value: "1." } });
    expect(onValue).not.toHaveBeenCalled();
    expect(stored()).toBe("9");
  });

  it("keeps a decimal somebody finishes typing", () => {
    render(<Harness initial={0} min={0} max={366} emptyValue={0} />);
    fireEvent.change(field(), { target: { value: "2.5" } });
    expect(stored()).toBe("2.5");
  });

  it("passes through the things a plain Input took", () => {
    render(
      <NumberField
        value={4}
        onChange={() => undefined}
        className="w-20"
        aria-label="Casual Leave days per year"
        data-testid="passthrough"
        disabled
      />,
    );
    const el = screen.getByTestId("passthrough") as HTMLInputElement;
    expect(el.disabled).toBe(true);
    expect(el.className).toContain("w-20");
    expect(el.getAttribute("aria-label")).toBe("Casual Leave days per year");
    expect(el.type).toBe("number");
  });
});
