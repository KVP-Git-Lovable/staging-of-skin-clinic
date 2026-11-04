import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { CalendarPopover } from "./CalendarPopover";

/**
 * The behaviour the hand-written popovers were missing.
 *
 * Picking a date used to leave the month grid open over the page, because an
 * uncontrolled Popover has nothing that can close it. These hold that fix in
 * place, along with the one thing that must NOT be tidied away: clicking the
 * selected day clears the date, which callers passing a plain setter rely on.
 */

function Harness({
  initial,
  onPick,
  disabled,
}: {
  initial?: Date;
  onPick?: (d: Date | undefined) => void;
  disabled?: React.ComponentProps<typeof CalendarPopover>["disabled"];
}) {
  const [date, setDate] = useState<Date | undefined>(initial);
  return (
    <>
      <CalendarPopover
        selected={date}
        disabled={disabled}
        onSelect={(d) => { setDate(d); onPick?.(d); }}
        trigger={<Button>{date ? date.toDateString() : "Pick a date"}</Button>}
      />
      <span data-testid="picked">{date ? date.toDateString() : "none"}</span>
    </>
  );
}

const SEPT_28 = new Date(2026, 8, 28);
const openIt = () => fireEvent.click(screen.getByRole("button", { name: /pick a date|2026/i }));
const monthHeading = () => screen.queryByText(/September 2026/);
const picked = () => screen.getByTestId("picked").textContent;

describe("CalendarPopover", () => {
  it("shows nothing until the trigger is clicked", () => {
    render(<Harness initial={SEPT_28} />);
    expect(monthHeading()).toBeNull();
    openIt();
    expect(monthHeading()).toBeTruthy();
  });

  it("opens on the month already chosen, not on today", () => {
    render(<Harness initial={SEPT_28} />);
    openIt();
    expect(monthHeading()).toBeTruthy();
  });

  it("closes once a day is picked, which is the whole point", () => {
    const onPick = vi.fn();
    render(<Harness initial={SEPT_28} onPick={onPick} />);
    openIt();
    // The 15th: it cannot also be August's tail or October's head in this grid.
    fireEvent.click(screen.getByText("15"));

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(picked()).toContain("Sep 15 2026");
    expect(monthHeading()).toBeNull();
  });

  it("still clears the date when the chosen day is clicked again, and closes", () => {
    // react-day-picker reports undefined when the selected day is re-clicked,
    // and callers passing a bare setter use that to get back to "Pick a date".
    const onPick = vi.fn();
    render(<Harness initial={SEPT_28} onPick={onPick} />);
    openIt();
    fireEvent.click(screen.getByText("28"));

    expect(onPick).toHaveBeenCalledWith(undefined);
    expect(picked()).toBe("none");
    expect(monthHeading()).toBeNull();
  });

  it("will not pick a day the caller disabled", () => {
    const onPick = vi.fn();
    render(<Harness initial={SEPT_28} onPick={onPick} disabled={{ before: new Date(2026, 8, 20) }} />);
    openIt();
    fireEvent.click(screen.getByText("5"));

    expect(onPick).not.toHaveBeenCalled();
    // Still open, because nothing was chosen.
    expect(monthHeading()).toBeTruthy();
  });
});
