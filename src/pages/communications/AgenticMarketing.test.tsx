import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const patients = [
  { id: "1", first_name: "Aarti", last_name: "Rao", city: "Mysuru", engagement_tier: "Gold", lifetime_value: 20000, total_visits: 4, created_at: "2026-04-01T00:00:00Z", registered_at: null, days_since_last_visit: 30 },
  { id: "2", first_name: "Rahul", last_name: "Nair", city: "Bengaluru", engagement_tier: "Silver", lifetime_value: 5000, total_visits: 1, created_at: "2025-12-01T00:00:00Z", registered_at: null, days_since_last_visit: 200 },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.range = (from: number) => Promise.resolve({ data: from === 0 ? patients : [], error: null });
      q.maybeSingle = () => Promise.resolve({ data: null, error: null });
      return q;
    },
  },
}));

const planPrompt = vi.fn();
const approveRun = vi.fn();
vi.mock("@/lib/comms/agent", async () => {
  const actual = await vi.importActual<typeof import("@/lib/comms/agent")>("@/lib/comms/agent");
  return { ...actual, planPrompt: (...a: unknown[]) => planPrompt(...a), approveRun: (...a: unknown[]) => approveRun(...a) };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import AgenticMarketing from "./AgenticMarketing";

const journeyPlan = {
  kind: "journey", journey_name: "Welcome offer · next Monday", filters_text: ["Created Date after 2026-03-14"],
  template: { id: "t1", name: "skin_welcome_offer", category: "MARKETING", status: "approved", body: "Hi {{1}}", variable_map: { "1": "patient_first_name" } },
  template_name: "skin_welcome_offer", start_iso: "2026-11-23T10:00", start_label: "next Monday",
  audience: { matching: 2, reachable: 2, without_phone: 0, opted_out: 0 }, sample: ["Aarti ••••3210"], cost_estimate: 1.7,
  checks: [{ level: "ok", message: "Template skin_welcome_offer is approved (marketing)." }], blocked: false, needs_second_confirmation: false,
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><AgenticMarketing /></MemoryRouter></QueryClientProvider>);
}

describe("AgenticMarketing", () => {
  beforeEach(() => { planPrompt.mockReset(); approveRun.mockReset(); });

  it("shows patient metrics and filters them", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("₹25,000")).toBeInTheDocument());
    expect(screen.getByText("Aarti Rao")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add filter/i }));
    expect(screen.queryByText(/No filters: every patient/i)).not.toBeInTheDocument();
  });

  it("plans a prompt, shows the plan and creates the draft only on approval", async () => {
    planPrompt.mockResolvedValue({ run_id: "r1", plan: journeyPlan, tool_calls: [{ name: "get_template", args: {} }] });
    approveRun.mockResolvedValue({ ok: true, kind: "journey", journey_id: "j1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Aarti Rao")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/works on the patients matching/i), { target: { value: "Send skin_welcome_offer to patients since 15 March, next Monday" } });
    fireEvent.click(screen.getByRole("button", { name: /plan with agent/i }));
    await waitFor(() => expect(screen.getByText("Welcome offer · next Monday")).toBeInTheDocument());
    expect(planPrompt).toHaveBeenCalledTimes(1);
    expect(approveRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /create draft journey/i }));
    await waitFor(() => expect(screen.getByText(/draft journey created/i)).toBeInTheDocument());
    expect(approveRun).toHaveBeenCalledWith("r1", false);
  });

  it("disables approval for a blocked plan and shows a question as plain text", async () => {
    planPrompt.mockResolvedValue({ run_id: "r2", plan: { ...journeyPlan, blocked: true, checks: [{ level: "bad", message: "Template skin_summer_peel is pending with WhatsApp and cannot be used yet." }] }, tool_calls: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText("Aarti Rao")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/works on the patients matching/i), { target: { value: "Send skin_summer_peel to patients next Monday" } });
    fireEvent.click(screen.getByRole("button", { name: /plan with agent/i }));
    await waitFor(() => expect(screen.getByText(/pending with WhatsApp/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /create draft journey/i })).toBeDisabled();

    planPrompt.mockResolvedValue({ run_id: "r3", plan: { kind: "question", question: "Which WhatsApp template should I send?" }, tool_calls: [] });
    fireEvent.click(screen.getByRole("button", { name: /plan with agent/i }));
    await waitFor(() => expect(screen.getByText("Which WhatsApp template should I send?")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /create draft journey/i })).not.toBeInTheDocument();
  });
});
