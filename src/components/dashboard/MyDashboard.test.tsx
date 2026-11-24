import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MyDashboard } from "./MyDashboard";

/**
 * The dashboard a therapist, a nurse or a receptionist gets.
 *
 * What it must NOT show is as much the point as what it must. A therapist
 * was landing on the clinic's whole day, and the thing that put it right is
 * worth a test that fails loudly if any of it leaks back.
 */

const ME = "staff-me";
const OTHER = "staff-other";

let rows: Record<string, unknown>[] = [];

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ staffProfile: { id: ME, firstName: "Reena" } }),
}));
vi.mock("@/hooks/useMyAttendanceToday", () => ({
  useMyAttendanceToday: () => ({ weekOffs: [], holidays: [], record: null }),
}));
// The attendance strip is covered by its own file; here it would only drag
// in the camera and the settings queries.
vi.mock("@/components/attendance/MyDayCard", () => ({
  MyDayCard: () => <div data-testid="my-day-card" />,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const result = table === "appointments"
        ? { data: rows, error: null }
        : { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "gte", "lte", "eq", "order"]) {
        chain[m] = () => chain;
      }
      // Awaiting the builder is what the component does.
      (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
      return chain;
    },
  },
}));

const appointment = (over: Record<string, unknown>) => ({
  id: Math.random().toString(36).slice(2),
  start_time: "2026-11-13T10:00:00+05:30",
  service: "Laser",
  status: "Confirmed",
  patient_name: "A Patient",
  therapist_id: null,
  therapist_ids: [],
  ...over,
});

function draw(withAppointments = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><MyDashboard withAppointments={withAppointments} /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { rows = []; });

describe("my appointments today", () => {
  it("lists one where I am in the therapist list", async () => {
    rows = [appointment({ therapist_ids: [OTHER, ME], patient_name: "Mine Multi" })];
    draw();
    expect(await screen.findByText("Mine Multi")).toBeInTheDocument();
  });

  it("lists one saved with only the single therapist column", async () => {
    // What the published build writes: therapist_id alone, therapist_ids
    // left at its '{}' default. therapistIdsOf falls back to it.
    rows = [appointment({ therapist_id: ME, therapist_ids: [], patient_name: "Mine Single" })];
    draw();
    expect(await screen.findByText("Mine Single")).toBeInTheDocument();
  });

  it("leaves out somebody else's appointment, and an unassigned one", async () => {
    rows = [
      appointment({ therapist_ids: [OTHER], patient_name: "Not Mine" }),
      appointment({ patient_name: "Nobody's" }),
      appointment({ therapist_ids: [ME], patient_name: "Mine" }),
    ];
    draw();
    expect(await screen.findByText("Mine")).toBeInTheDocument();
    expect(screen.queryByText("Not Mine")).toBeNull();
    expect(screen.queryByText("Nobody's")).toBeNull();
    expect(screen.getByTestId("my-appointment-count")).toHaveTextContent("1");
  });

  it("explains an empty day rather than just saying none", async () => {
    // No appointment in this clinic has ever had a therapist on it, so the
    // first person to open this would reasonably think it was broken.
    rows = [appointment({ therapist_ids: [OTHER] })];
    draw();
    const empty = await screen.findByTestId("no-appointments-assigned");
    expect(empty).toHaveTextContent(/No appointments are assigned to you today/i);
    expect(empty).toHaveTextContent(/picks the therapist or nurse on the appointment/i);
  });
});

describe("the attendance-only dashboard", () => {
  it("has no appointments block at all", () => {
    rows = [appointment({ therapist_ids: [ME], patient_name: "Mine" })];
    draw(false);
    expect(screen.queryByText("My appointments today")).toBeNull();
    expect(screen.queryByText("Mine")).toBeNull();
  });

  it("still shows the working day and the week", () => {
    draw(false);
    expect(screen.getByTestId("my-day-card")).toBeInTheDocument();
    expect(screen.getByText("My week so far")).toBeInTheDocument();
    expect(screen.getByTestId("week-hours")).toBeInTheDocument();
  });
});

describe("what neither dashboard may show", () => {
  it("shows no clinic figures, money or charts", async () => {
    rows = [appointment({ therapist_ids: [ME] })];
    const { container } = draw();
    await screen.findByText("My appointments today");
    const text = container.textContent ?? "";
    for (const leak of [
      "Total Appointments", "Confirmed Appointments", "Billed Appointments",
      "Revenue", "Pending Invoices", "New Patients", "Total Patients",
      "Staff Present", "Active Campaigns", "Appointments by Doctor",
      "Appointment Trend", "Patient Feedback", "₹",
    ]) {
      expect(text, `the clinic's "${leak}" is on a scoped dashboard`).not.toContain(leak);
    }
  });

  it("offers no clinic-wide filter bar", () => {
    draw();
    expect(screen.queryByText(/Pin these filters/i)).toBeNull();
  });
});
