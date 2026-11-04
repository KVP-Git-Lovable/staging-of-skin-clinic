import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PatientSplitView from "./PatientSplitView";

/**
 * The split view shows the list of patients and the selected one's detail
 * heading side by side, so the same patient's mark is on screen twice at once.
 * That is exactly why neither of them sweeps - see VipBadge.
 */
const ROWS = [
  { id: "vip-1", first_name: "Sanah", last_name: "Pai", phone: "9811141023", is_vip: true },
  { id: "plain-1", first_name: "Shilpa", last_name: "Prabhu", phone: "9704014970", is_vip: false },
];

const renderSplit = () =>
  render(<PatientSplitView rows={ROWS} columns={["full_name", "phone"]} onOpen={vi.fn()} />);

describe("PatientSplitView", () => {
  it("marks the VIP in the list and again in the detail heading", () => {
    // rows[0] is selected by default, and it is the VIP - so the same patient
    // is marked in both panes.
    const { container } = renderSplit();
    expect(container.querySelectorAll(".vip-badge")).toHaveLength(2);
  });

  it("gives both of them the same mark, never one swept and one still", () => {
    const { container } = renderSplit();
    expect(container.querySelector(".vip-badge-shimmer")).toBeNull();
  });

  it("leaves a patient who is not a VIP unmarked", () => {
    const { container } = render(
      <PatientSplitView rows={[ROWS[1]]} columns={["full_name", "phone"]} onOpen={vi.fn()} />
    );
    expect(container.querySelector(".vip-badge")).toBeNull();
  });

  it("still shows the names", () => {
    renderSplit();
    expect(screen.getAllByText("Sanah Pai").length).toBeGreaterThan(0);
    expect(screen.getByText("Shilpa Prabhu")).toBeInTheDocument();
  });
});
