import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { TimePicker12h } from "./TimePicker12h";

/**
 * The picker as every caller actually wires it: the value it is handed is the
 * value it last asked for. A vi.fn() that swallows onChange hides this whole
 * class of fault - the control keeps reading the time it was given even after
 * telling the parent to throw it away.
 */
function Controlled({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <TimePicker12h value={value} onChange={setValue} />
      <output data-testid="stored">{value}</output>
    </>
  );
}

const stored = () => screen.getByTestId("stored").textContent;

describe("TimePicker12h", () => {
  it("offers both AM and PM", () => {
    // The clinic reported PM as missing. It was rendered all along - the
    // container clipped it once the control got narrow, so staff could not
    // see it or click it. Both halves must be reachable.
    render(<TimePicker12h value="04:15" onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "AM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PM" })).toBeTruthy();
  });

  it("turns a morning time into the afternoon when PM is clicked", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="04:15" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "PM" }));

    expect(onChange).toHaveBeenCalledWith("16:15");
  });

  it("turns an afternoon time back into the morning when AM is clicked", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="16:15" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "AM" }));

    expect(onChange).toHaveBeenCalledWith("04:15");
  });

  it("shows an afternoon time as PM, on the twelve-hour clock", () => {
    render(<TimePicker12h value="16:15" onChange={() => {}} />);

    expect((screen.getByLabelText("Hour") as HTMLInputElement).value).toBe("4");
    expect((screen.getByLabelText("Minute") as HTMLInputElement).value).toBe("15");
    // Noon and midnight are the cases a 12-hour clock usually gets wrong.
    expect(screen.getByRole("button", { name: "PM" }).className).toContain("bg-primary");
  });

  it("keeps midday and midnight on the right side of the clock", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimePicker12h value="12:00" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "PM" }).className).toContain("bg-primary");

    rerender(<TimePicker12h value="00:30" onChange={onChange} />);
    expect(screen.getByRole("button", { name: "AM" }).className).toContain("bg-primary");
    expect((screen.getByLabelText("Hour") as HTMLInputElement).value).toBe("12");
  });
});

/**
 * Two faults the front desk reported together, which turned out to be one
 * line: emptying either box called onChange("") and wiped the stored time, so
 * the other box and the AM/PM toggle had nothing left to read.
 *
 *   "When we just press on backspace at minutes or hours, whole things gets
 *    backspaced ... and sometimes when kept on AM, and edited the time and
 *    come back, it changes to PM"
 */
describe("TimePicker12h - backspacing one box", () => {
  const hourBox = () => screen.getByLabelText("Hour") as HTMLInputElement;
  const minuteBox = () => screen.getByLabelText("Minute") as HTMLInputElement;

  it("does not wipe the time when the minutes are cleared to retype them", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="09:00" onChange={onChange} />);

    fireEvent.change(minuteBox(), { target: { value: "" } });

    // The whole appointment time used to go, taking the hour with it.
    expect(onChange).not.toHaveBeenCalledWith("");
    expect(hourBox().value).toBe("9");
  });

  it("does not wipe the time when the hour is cleared to retype it", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="09:30" onChange={onChange} />);

    fireEvent.change(hourBox(), { target: { value: "" } });

    expect(onChange).not.toHaveBeenCalledWith("");
    expect(minuteBox().value).toBe("30");
  });

  it("keeps the minutes AND the afternoon when the hour is retyped", () => {
    // The reported flip, against a parent that really applies the value:
    // 2:30 PM, backspace the hour, type 5. It used to come back 5:00 AM -
    // minutes reset to zero and the side of noon reset to the AM default,
    // because the value they were read from had been thrown away.
    render(<Controlled initial="14:30" />);

    fireEvent.change(hourBox(), { target: { value: "" } });
    fireEvent.change(hourBox(), { target: { value: "5" } });

    expect(stored()).toBe("17:30");
  });

  it("keeps the hour and the afternoon when the minutes are retyped", () => {
    render(<Controlled initial="14:30" />);

    fireEvent.change(minuteBox(), { target: { value: "" } });
    fireEvent.change(minuteBox(), { target: { value: "45" } });

    expect(stored()).toBe("14:45");
  });

  it("leaves the other box on screen while one is being retyped", () => {
    // What the screenshot showed: backspacing the hour blanked the minutes
    // too, so the whole time had to be entered again.
    render(<Controlled initial="09:30" />);

    fireEvent.change(hourBox(), { target: { value: "" } });

    expect(hourBox().value).toBe("");
    expect(minuteBox().value).toBe("30");
    expect(stored()).toBe("09:30");
  });

  it("puts the time back if a box is left empty and the cursor moves on", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="09:30" onChange={onChange} />);

    fireEvent.change(hourBox(), { target: { value: "" } });
    fireEvent.blur(hourBox());

    expect(hourBox().value).toBe("9");
    expect(onChange).not.toHaveBeenCalledWith("");
  });

  it("still clears the time once BOTH boxes are empty", () => {
    // Deliberately clearing an optional time has to keep working.
    const onChange = vi.fn();
    render(<TimePicker12h value="09:30" onChange={onChange} />);

    fireEvent.change(minuteBox(), { target: { value: "" } });
    fireEvent.change(hourBox(), { target: { value: "" } });

    expect(onChange).toHaveBeenCalledWith("");
  });
});

describe("TimePicker12h - the side of noon survives", () => {
  const hourBox = () => screen.getByLabelText("Hour") as HTMLInputElement;
  const minuteBox = () => screen.getByLabelText("Minute") as HTMLInputElement;

  it("remembers the afternoon across a full clear and retype", () => {
    const onChange = vi.fn();
    const { rerender } = render(<TimePicker12h value="14:30" onChange={onChange} />);

    fireEvent.change(minuteBox(), { target: { value: "" } });
    fireEvent.change(hourBox(), { target: { value: "" } });
    // The parent accepts the clear and hands back an empty value.
    rerender(<TimePicker12h value="" onChange={onChange} />);
    fireEvent.change(hourBox(), { target: { value: "5" } });

    // 17:00, not 05:00 - nobody touched the toggle, so it is still PM.
    expect(onChange).toHaveBeenLastCalledWith("17:00");
  });

  it("does not invent a time when AM or PM is pressed on an empty box", () => {
    // Pressing PM used to convert "nothing" through the nine o'clock default
    // and quietly write 9 PM into a half-filled form.
    const onChange = vi.fn();
    render(<TimePicker12h value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "PM" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "PM" }).className).toContain("bg-primary");
  });

  it("applies the side chosen on an empty box to the hour typed after it", () => {
    const onChange = vi.fn();
    render(<TimePicker12h value="" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    fireEvent.change(screen.getByLabelText("Hour"), { target: { value: "3" } });

    expect(onChange).toHaveBeenLastCalledWith("15:00");
  });

  it("leaves a real time to say which side of noon it is on", () => {
    // A stored time always wins over what was last pressed.
    const onChange = vi.fn();
    const { rerender } = render(<TimePicker12h value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "PM" }));

    rerender(<TimePicker12h value="09:00" onChange={onChange} />);

    expect(screen.getByRole("button", { name: "AM" }).className).toContain("bg-primary");
  });
});
