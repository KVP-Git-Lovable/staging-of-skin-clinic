import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateInput } from "./DateInput";

/** Mirrors how PatientFormSheet holds date_of_birth: ISO in, ISO out. */
function Harness({ initial = "", onIso, withCalendar, inputClassName }: { initial?: string; onIso?: (v: string) => void; withCalendar?: boolean; inputClassName?: string }) {
  const [iso, setIso] = useState(initial);
  return (
    <>
      <DateInput
        value={iso}
        onChange={(v) => { setIso(v); onIso?.(v); }}
        withCalendar={withCalendar}
        inputClassName={inputClassName}
      />
      <span data-testid="stored">{iso}</span>
    </>
  );
}

const box = () => screen.getByPlaceholderText("dd/mm/yyyy") as HTMLInputElement;
const stored = () => screen.getByTestId("stored").textContent;

/** Types one character at a time, the way a person actually fills the field. */
function type(chars: string) {
  for (const c of chars) {
    fireEvent.change(box(), { target: { value: box().value + c } });
  }
}

describe("DateInput", () => {
  it("shows a stored date in dd/MM/yyyy, not the browser's order", () => {
    render(<Harness initial="1982-07-31" />);
    expect(box().value).toBe("31/07/1982");
  });

  it("can be typed straight through, inserting the slashes itself", () => {
    render(<Harness />);
    type("31071982");
    expect(box().value).toBe("31/07/1982");
    expect(stored()).toBe("1982-07-31");
  });

  it("holds the date back until it is complete, so a partial entry is never stored", () => {
    render(<Harness />);
    type("3107");
    expect(box().value).toBe("31/07");
    expect(stored()).toBe("");
    type("1982");
    expect(stored()).toBe("1982-07-31");
  });

  it("lets the user edit an existing date without the text fighting back", () => {
    // The trap this component exists to avoid: reformatting mid-edit, which
    // pushes the caret and leaves the typist unable to correct a digit.
    render(<Harness initial="1982-07-31" />);
    fireEvent.change(box(), { target: { value: "31/07/198" } });
    expect(box().value).toBe("31/07/198");
    fireEvent.change(box(), { target: { value: "31/07/1983" } });
    expect(box().value).toBe("31/07/1983");
    expect(stored()).toBe("1983-07-31");
  });

  it("clears the stored date when the box is emptied", () => {
    render(<Harness initial="1982-07-31" />);
    fireEvent.change(box(), { target: { value: "" } });
    expect(box().value).toBe("");
    expect(stored()).toBe("");
  });

  it("snaps back on blur rather than showing one date and saving another", () => {
    render(<Harness initial="1982-07-31" />);
    fireEvent.change(box(), { target: { value: "31/07/19" } });
    expect(stored()).toBe("1982-07-31");
    fireEvent.blur(box());
    expect(box().value).toBe("31/07/1982");
  });

  it("refuses a day that does not exist instead of rolling it into next month", () => {
    render(<Harness />);
    type("31021982");
    expect(box().value).toBe("31/02/1982");
    expect(stored()).toBe("");
  });
});

/**
 * Booking an appointment offers a month view; editing one only had a text box,
 * so rescheduling meant typing eight digits. The calendar is opt-in, so every
 * other date field in the app keeps exactly the box it had.
 */
describe("DateInput with a calendar", () => {
  it("offers no calendar unless asked, so existing fields are untouched", () => {
    render(<Harness initial="2026-09-28" />);
    expect(screen.queryByLabelText("Open calendar")).toBeNull();
  });

  it("offers a calendar when asked, alongside a box that still types", () => {
    render(<Harness initial="2026-09-28" withCalendar />);
    expect(screen.getByLabelText("Open calendar")).toBeTruthy();
    expect(box().value).toBe("28/09/2026");

    fireEvent.change(box(), { target: { value: "" } });
    type("29092026");
    expect(stored()).toBe("2026-09-29");
  });

  it("opens the month of the date already on the appointment", () => {
    render(<Harness initial="2026-09-28" withCalendar />);
    fireEvent.click(screen.getByLabelText("Open calendar"));
    expect(screen.getByText(/September 2026/)).toBeTruthy();
  });

  it("writes the day that was clicked, not the one before it", () => {
    render(<Harness initial="2026-09-28" withCalendar />);
    fireEvent.click(screen.getByLabelText("Open calendar"));
    // A date built with toISOString() would store the 15th as the 14th for any
    // clinic east of UTC, which is every one of them here. The 15th is picked
    // because it cannot also be August's tail or October's head in this grid.
    fireEvent.click(screen.getByText("15"));
    expect(stored()).toBe("2026-09-15");
    expect(box().value).toBe("15/09/2026");
  });

  it("closes once the day is picked, rather than sitting over the page", () => {
    render(<Harness initial="2026-09-28" withCalendar />);
    fireEvent.click(screen.getByLabelText("Open calendar"));
    expect(screen.queryByText(/September 2026/)).toBeTruthy();

    fireEvent.click(screen.getByText("15"));
    expect(screen.queryByText(/September 2026/)).toBeNull();
  });
});

describe("sizing the box itself", () => {
  // className sizes the wrapper once a calendar button has to sit inside it,
  // which is right for a width but cannot make the box shorter. The reports
  // filter bar needs h-8 on the input; putting it on the wrapper would only
  // move the button and leave a full-height box in a compact row.
  it("reaches the input whether or not there is a calendar", () => {
    const { unmount } = render(<Harness initial="2026-09-28" inputClassName="h-8 text-xs" />);
    expect(box().className).toContain("h-8");
    unmount();

    render(<Harness initial="2026-09-28" withCalendar inputClassName="h-8 text-xs" />);
    expect(box().className).toContain("h-8");
    // and the box is still the one the calendar writes into
    expect(box().className).toContain("pr-9");
  });
});
