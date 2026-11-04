import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MyDayCard } from "./MyDayCard";

/**
 * The card is a rendering of useMyAttendanceDay, so the hook is stubbed and
 * these tests check the one thing this file is responsible for: that a given
 * day state is drawn correctly.
 *
 * The check-in itself - face match, retries, location, the photo stamp - is
 * the hook's and is covered by the pure decisions in src/lib/attendance.ts.
 * Duplicating that here would test the mock.
 *
 * What matters most below is the DISABLED state of the two buttons. This card
 * exists so a receptionist can clock in without walking to another page; a
 * card that offers "Start My Day" to somebody already working, or "End My
 * Day" to somebody who never started, would record a day that did not happen.
 */
const press = vi.fn();

const dayState = (over: Record<string, unknown> = {}) => ({
  record: null as unknown,
  phase: "not_started",
  buttons: { start: { label: "Start My Day", disabled: false }, end: { label: "End My Day", disabled: true } },
  busy: false,
  mode: "check_in",
  step: "idle",
  stepLabel: "",
  attempt: 0,
  hasPhoto: true,
  config: { require_selfie: true, capture_location: true, face_match_threshold: 75, face_max_attempts: 3 },
  closedToday: "",
  press,
  cameraProps: { open: false, onOpenChange: vi.fn(), title: "", defaultFacing: "user", faceGuide: true, onCapture: vi.fn() },
  hours: null,
  elapsed: () => null,
  ...over,
});

let state = dayState();

vi.mock("@/hooks/useMyAttendanceDay", () => ({ useMyAttendanceDay: () => state }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ staffProfile: { id: "s1", firstName: "Asha" } }) }));

const draw = () => render(<MemoryRouter><MyDayCard /></MemoryRouter>);

beforeEach(() => {
  press.mockClear();
  state = dayState();
});

describe("MyDayCard", () => {
  it("offers only Start before the day begins", () => {
    draw();
    expect(screen.getByTestId("dash-start-my-day")).toBeEnabled();
    expect(screen.getByTestId("dash-end-my-day")).toBeDisabled();
    expect(screen.getByText(/day hasn't started/i)).toBeInTheDocument();
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

  it("shows what it is doing instead of a dead button mid-check-in", () => {
    state = dayState({ busy: true, mode: "check_in", step: "verifying", stepLabel: "Verifying face match…" });
    draw();
    expect(screen.getByText("Verifying face match…")).toBeInTheDocument();
    expect(screen.getByTestId("dash-start-my-day")).toBeDisabled();
  });
});
