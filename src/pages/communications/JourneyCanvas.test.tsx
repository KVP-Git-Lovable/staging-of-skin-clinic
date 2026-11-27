import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const journey = {
  id: "j1", name: "Welcome", description: null, status: "draft", approval_status: "draft", audience_config: null,
  canvas_data: { nodes: [{ id: "entry", type: "entry", position: { x: 0, y: 0 }, data: {} }], edges: [] },
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", schedule: null,
};
const enrollments = [{ id: "e1", patient_id: "p1", status: "active", current_node_id: "entry", enrolled_at: "2026-11-02T04:00:00Z", patients: { first_name: "Asha", last_name: "Rao", phone: "9876543210" } }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({ data: table === "comms_journeys" ? journey : null, error: null });
      q.range = (from: number) => Promise.resolve({ data: from === 0 && table === "comms_journey_enrollments" ? enrollments : [], error: null });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
      return q;
    },
  },
}));
// The canvas library and the analytics body have their own behaviour; here only the tab shell is under test.
vi.mock("@xyflow/react", async () => {
  const React = await import("react");
  return {
    ReactFlow: () => <div data-testid="flow" />, ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Background: () => null, Controls: () => null, addEdge: (_c: unknown, e: unknown[]) => e,
    useNodesState: (init: unknown[]) => { const [v, set] = React.useState(init); return [v, set, () => {}]; },
    useEdgesState: (init: unknown[]) => { const [v, set] = React.useState(init); return [v, set, () => {}]; },
    useReactFlow: () => ({ fitView: () => Promise.resolve(), getZoom: () => 1, zoomTo: () => {} }),
    useNodesInitialized: () => false, Handle: () => null, Position: {},
  };
});
vi.mock("@/pages/communications/JourneyAnalytics", () => ({ JourneyAnalyticsView: ({ id }: { id: string }) => <div>analytics for {id}</div> }));

import JourneyCanvas from "./JourneyCanvas";

function renderAt(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}><Routes><Route path="/communications/journeys/:id" element={<JourneyCanvas />} /></Routes></MemoryRouter>
    </QueryClientProvider>,
  );
}
const openTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 });

describe("journey screen tabs", () => {
  it("opens on the canvas with the existing header actions", async () => {
    renderAt("/communications/journeys/j1");
    await waitFor(() => expect(screen.getByTestId("flow")).toBeInTheDocument());
    for (const t of ["Canvas", "Analytics", "Members"]) expect(screen.getByRole("tab", { name: t })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit for approval/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /schedule/i })).toBeInTheDocument();
  });

  it("shows analytics and members in their tabs and keeps the canvas mounted", async () => {
    renderAt("/communications/journeys/j1");
    await waitFor(() => expect(screen.getByTestId("flow")).toBeInTheDocument());
    openTab("Analytics");
    expect(await screen.findByText("analytics for j1")).toBeInTheDocument();
    openTab("Members");
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.getByTestId("flow")).toBeInTheDocument();
  });

  it("opens a tab named in the address, drawing the canvas only when it is shown", async () => {
    renderAt("/communications/journeys/j1?tab=members");
    expect(await screen.findByText("Asha Rao")).toBeInTheDocument();
    expect(screen.queryByTestId("flow")).not.toBeInTheDocument();
    openTab("Canvas");
    expect(await screen.findByTestId("flow")).toBeInTheDocument();
  });
});
