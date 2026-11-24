import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyDayCard } from "./MyDayCard";

/**
 * The card is a rendering of the day's state, so the read hook is stubbed
 * and these tests check the one thing this file is responsible for: that a
 * given day state is drawn correctly.
 *
 * The check-in itself - face match, retries, location, the photo stamp -
 * belongs to /attendance and is covered by the pure decisions in
 * src/lib/attendance.ts. This card no longer performs it: the clinic asked
 * for the buttons to OPEN that page rather than take the selfie here, so
 * what these tests hold is that both buttons are links, that the spent one
 * is still disabled, and that no camera is mounted on the dashboard.
 *
 * The disabled state is the part that matters most. A card offering "Start
 * My Day" to somebody already working, or "End My Day" to somebody who never
 * started, sends them to a page where the button they wanted is dead.
 */
const dayState = (over: Record<string, unknown> = {}) => ({
  record: null as unknown,
  phase: "not_started",
  buttons: { start: { label: "Start My Day", disabled: false }, end: { label: "End My Day", disabled: true } },
  staffId: "s1",
  config: { require_selfie: true, capture_location: true, face_match_threshold: 75, face_max_attempts: 3 },
  weekOffs: [],
  holidays: [],
  closedToday: "",
  hours: null,
  elapsed: () => null,
  refetch: vi.fn(),
  ...over,
});

let state = dayState();

vi.mock("@/hooks/useMyAttendanceToday", () => ({ useMyAttendanceToday: () => state }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ staffProfile: { id: "s1", firstName: "Asha" } }) }));

const draw = () => render(<MemoryRouter><MyDayCard /></MemoryRouter>);

beforeEach(() => {
  state = dayState();
});

describe("MyDayCard", () => {
  it("offers only Start before the day begins", () => {
    draw();
    expect(screen.getByTestId("dash-start-my-day")).toBeEnabled();
    expect(screen.getByTestId("dash-end-my-day")).toBeDisabled();
    expect(screen.getByText(/day hasn't started/i)).toBeInTheDocument();
  });

  it("OPENS the attendance page rather than marking the day here", () => {
    // The clinic asked for the redirect. The live button has to be an
    // anchor, not a button that does the work in place.
    draw();
    const start = screen.getByTestId("dash-start-my-day");
    expect(start.tagName).toBe("A");
    expect(start).toHaveAttribute("href", "/attendance");
  });

  it("mounts no camera on the dashboard", () => {
    // The selfie, the face match and the retry count went back to the page
    // that owns them; leaving a second CameraDialog here would be the exact
    // duplication useMyAttendanceDay's header warns about.
    const { container } = draw();
    expect(container.querySelector("video")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not link the spent button anywhere", () => {
    // A disabled anchor is not a thing - it would still navigate.
    state = dayState({
      phase: "running",
      buttons: { start: { label: "Day Started", disabled: true }, end: { label: "End My Day", disabled: false } },
    });
    draw();
    const spent = screen.getByTestId("dash-start-my-day");
    expect(spent.tagName).toBe("BUTTON");
    expect(spent).toBeDisabled();
    expect(spent).not.toHaveAttribute("href");
  });

  it("shows today's hours, which it never used to", () => {
    state = dayState({ phase: "running", hours: 3.5 });
    draw();
    expect(screen.getByText(/3h 30m today/)).toBeInTheDocument();
  });

  it("shows the running total and offers only End once working", () => {
    state = dayState({
      phase: "running",
      record: { check_in_time: "2026-11-03T09:00:00+05:30" },
      buttons: { start: { label: "Day Started", disabled: true }, end: { label: "End My Day", disabled: false } },
      elapsed: () => "3h 42m",
    });
    draw();
    expect(screen.getByTestId("dash-start-my-day")).toBeDisabled();
    expect(screen.getByTestId("dash-end-my-day")).toBeEnabled();
    expect(screen.getByText("3h 42m")).toBeInTheDocument();
    expect(screen.getByText(/Started 9:00 AM/)).toBeInTheDocument();
  });

  it("drops both buttons once the day is complete, and shows both times", () => {
    state = dayState({
      phase: "complete",
      record: { check_in_time: "2026-11-03T09:00:00+05:30", check_out_time: "2026-11-03T18:30:00+05:30" },
      buttons: { start: { label: "Day Ended", disabled: true }, end: { label: "Day Ended", disabled: true } },
      elapsed: () => "9h 30m",
    });
    draw();
    // Not merely disabled - absent. The headline already says the day is
    // complete, so two dead buttons both reading "Day Ended" are noise.
    expect(screen.queryByTestId("dash-start-my-day")).toBeNull();
    expect(screen.queryByTestId("dash-end-my-day")).toBeNull();
    expect(screen.getByText("9h 30m")).toBeInTheDocument();
    expect(screen.getByText(/Started 9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/Ended 6:30 PM/)).toBeInTheDocument();
  });

  it("names a week off but still lets the day be recorded", () => {
    // Labelling, not blocking: a doctor coming in on a Sunday for one
    // procedure still has to clock in.
    state = dayState({ closedToday: "Week off" });
    draw();
    expect(screen.getByText(/Week off — you can still record it/)).toBeInTheDocument();
    expect(screen.getByTestId("dash-start-my-day")).toBeEnabled();
  });

  it("renders NOTHING for an account with no staff record", async () => {
    // A patient-portal login, or a staff row that was never linked. Two dead
    // buttons on their dashboard would be worse than no card.
    vi.resetModules();
    vi.doMock("@/hooks/useAuth", () => ({ useAuth: () => ({ staffProfile: null }) }));
    const { MyDayCard: Card } = await import("./MyDayCard");
    const { container } = render(<MemoryRouter><Card /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
    vi.doUnmock("@/hooks/useAuth");
  });

  it("still names what already happened on the spent button", () => {
    // "Day Started" on a greyed-out button is what tells somebody at a
    // glance where they are, and it survived the move to links.
    state = dayState({
      phase: "running",
      buttons: { start: { label: "Day Started", disabled: true }, end: { label: "End My Day", disabled: false } },
    });
    draw();
    expect(screen.getByText("Day Started")).toBeInTheDocument();
  });
});
