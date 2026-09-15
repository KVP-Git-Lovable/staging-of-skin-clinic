import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReportFilterBar, type FilterState } from "./ReportFilterBar";
import type { ReportFilterDef } from "@/lib/reportsCatalog";

const FILTERS: ReportFilterDef[] = [
  { key: "dateRange", label: "Created", type: "dateRange", serverDateField: "created_at" },
];

const DAY = new Date(2026, 8, 10); // 10 Sep 2026

function Harness({ singleDay }: { singleDay: boolean }) {
  const [state, setState] = useState<FilterState>({
    search: "seed",
    dateFrom: singleDay ? DAY : undefined,
    dateTo: singleDay ? DAY : undefined,
    selects: {},
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ReportFilterBar filters={FILTERS} state={state} onChange={setState} singleDay={singleDay} />
      <output data-testid="out">
        {JSON.stringify({
          from: state.dateFrom?.toDateString() ?? null,
          to: state.dateTo?.toDateString() ?? null,
          search: state.search,
        })}
      </output>
    </QueryClientProvider>
  );
}

const read = () => JSON.parse(screen.getByTestId("out").textContent || "{}");

describe("ReportFilterBar single-day mode", () => {
  it("offers one date picker instead of a from/to range", () => {
    render(<Harness singleDay />);
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.queryByText("Created from")).not.toBeInTheDocument();
    expect(screen.queryByText("Created to")).not.toBeInTheDocument();
  });

  it("shows a single period dropdown for unrestricted accounts", () => {
    render(<Harness singleDay={false} />);
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.queryByText("Created from")).not.toBeInTheDocument();
    expect(screen.getByText("Current Month")).toBeInTheDocument();
  });

  it("keeps the day selected when Clear is pressed, so the limit cannot be dropped", () => {
    render(<Harness singleDay />);
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    const out = read();
    expect(out.search).toBe("");        // other filters do clear
    expect(out.from).toBe(DAY.toDateString());
    expect(out.to).toBe(DAY.toDateString());
  });

  it("resets unrestricted accounts back to the pinned current month", () => {
    render(<Harness singleDay={false} />);
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /Clear/ }));
    const out = read();
    expect(out.search).toBe("");
    expect(out.from).not.toBeNull();
    expect(out.to).not.toBeNull();
  });

  it("moves both ends of the range together when a new day is picked", () => {
    render(<Harness singleDay />);
    fireEvent.click(screen.getByText("10 Sep 2026"));
    fireEvent.click(screen.getByRole("gridcell", { name: "15" }).firstChild as HTMLElement);

    const out = read();
    expect(out.from).toBe(out.to);
    expect(out.from).toContain("Sep 15 2026");
  });
});
