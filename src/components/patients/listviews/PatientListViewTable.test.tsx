import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import PatientListViewTable from "./PatientListViewTable";

/**
 * The VIP mark showed on the patient's own record and on the appointments
 * screens, but not in the list the front desk actually looks people up in - so
 * a VIP was only recognisable once you had already opened their record, which
 * is too late to be any use.
 *
 * No mocks: neither this wrapper nor the generic table it renders through
 * touches Supabase, react-query or the router.
 */

// full_name is derived from first_name/last_name by rawValue, not stored, so
// the fixtures must not carry it.
const ROWS = [
  { id: "vip-1", first_name: "Sanah", last_name: "Pai", phone: "9811141023", is_vip: true },
  { id: "plain-1", first_name: "Shilpa", last_name: "Prabhu", phone: "9704014970", is_vip: false },
];

const renderTable = (rows: Record<string, unknown>[] = ROWS) =>
  render(
    <PatientListViewTable
      rows={rows}
      columns={["full_name", "phone"]}
      selectedIds={new Set<string>()}
      onToggle={vi.fn()}
      onToggleAll={vi.fn()}
      onOpen={vi.fn()}
      // Left out on purpose: with no photo the rows render initials, so the
      // only role="img" on screen is the badge itself.
    />
  );

describe("PatientListViewTable", () => {
  it("marks the VIP, and only the VIP", () => {
    renderTable();
    expect(screen.getAllByRole("img", { name: "VIP patient" })).toHaveLength(1);
  });

  it("puts the mark on the right patient's row", () => {
    renderTable();
    const vipCell = screen.getByText("Sanah Pai").closest("td");
    const plainCell = screen.getByText("Shilpa Prabhu").closest("td");
    expect(vipCell?.querySelector(".vip-badge")).toBeTruthy();
    expect(plainCell?.querySelector(".vip-badge")).toBeNull();
  });

  it("marks nobody when nobody is a VIP", () => {
    renderTable([{ id: "a", first_name: "Devaki", last_name: "", phone: "7899495098", is_vip: false }]);
    expect(screen.queryByRole("img", { name: "VIP patient" })).toBeNull();
  });

  // A row that never carried the column must not be guessed into a VIP.
  it("marks nobody when the column was never fetched", () => {
    // The rows prop is untyped, exactly as a page that fetched narrow columns
    // would hand it over - no cast needed to leave the flag off.
    renderTable([{ id: "a", first_name: "Devaki", last_name: "", phone: "7899495098" }]);
    expect(screen.queryByRole("img", { name: "VIP patient" })).toBeNull();
  });

  // Fifty rows of sweeping gold is fifty compositor layers on a clinic PC.
  it("does not sweep in a list", () => {
    const { container } = renderTable();
    expect(container.querySelector(".vip-badge-shimmer")).toBeNull();
  });

  it("leaves the name's own truncation alone", () => {
    renderTable();
    expect(screen.getByText("Sanah Pai").className).toContain("line-clamp-2");
  });
});
