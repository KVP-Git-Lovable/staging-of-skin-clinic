import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const channel = {
  on: vi.fn(),
  subscribe: vi.fn(),
};
channel.on.mockReturnValue(channel);
channel.subscribe.mockReturnValue(channel);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  },
}));

import { useLiveAppointments } from "./useLiveAppointments";
import { APPOINTMENT_QUERY_KEYS } from "@/lib/liveAppointments";

/**
 * The reported fault, at the level it actually broke: the front desk moves an
 * appointment and the doctor's screen keeps the old time. Live updates were
 * invalidating one key while the dashboard, the patient record and the
 * prescription sheet each named their query something else - and React Query
 * matches keys by prefix, so none of them were ever reached.
 */
describe("useLiveAppointments", () => {
  let queryClient: QueryClient;

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  /** The handler the hook registered for postgres_changes. */
  const fireAppointmentChange = () => {
    const handler = channel.on.mock.calls.at(-1)?.[2] as (payload: unknown) => void;
    handler({ eventType: "UPDATE", new: { id: "appt-1" }, old: { id: "appt-1" } });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    channel.on.mockClear();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes every screen that holds appointments, not just the list", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useLiveAppointments(), { wrapper });

    fireAppointmentChange();
    vi.runAllTimers();

    const refreshed = invalidate.mock.calls.map((c) => (c[0]?.queryKey as string[])?.[0]);
    for (const key of APPOINTMENT_QUERY_KEYS) {
      expect(refreshed).toContain(key);
    }
  });

  it("reaches the three screens the clinic was reading stale times from", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useLiveAppointments(), { wrapper });

    fireAppointmentChange();
    vi.runAllTimers();

    const refreshed = invalidate.mock.calls.map((c) => (c[0]?.queryKey as string[])?.[0]);
    expect(refreshed).toContain("dashboard-appointments");
    expect(refreshed).toContain("patient-appointments");
    expect(refreshed).toContain("procedure-followup-appointments");
  });

  it("holds everything back while somebody is mid-edit", () => {
    // Nothing may be redrawn under a doctor who is typing.
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useLiveAppointments({ paused: true }), { wrapper });

    fireAppointmentChange();
    vi.runAllTimers();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("tells the screen which appointment changed", () => {
    const onAppointment = vi.fn();
    renderHook(() => useLiveAppointments({ onAppointment }), { wrapper });

    fireAppointmentChange();

    expect(onAppointment).toHaveBeenCalledWith("appt-1", expect.any(String));
  });

  it("collapses a run of front-desk edits into one refresh", () => {
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    renderHook(() => useLiveAppointments(), { wrapper });

    fireAppointmentChange();
    fireAppointmentChange();
    fireAppointmentChange();
    vi.runAllTimers();

    // One pass over the keys, not three.
    expect(invalidate).toHaveBeenCalledTimes(APPOINTMENT_QUERY_KEYS.length);
  });
});
