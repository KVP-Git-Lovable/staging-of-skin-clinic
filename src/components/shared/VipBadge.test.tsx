import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { VipBadge } from "./VipBadge";

/**
 * The mark exists so somebody at the desk recognises a patient they do not
 * know. Everything below is about it still doing that job when the pretty part
 * is switched off.
 */
describe("VipBadge", () => {
  it("says VIP", () => {
    render(<VipBadge />);
    expect(screen.getByText("VIP")).toBeInTheDocument();
  });

  // The calendar blocks are a few millimetres tall; the crown goes in alone.
  // A screen reader must still hear what it means rather than nothing.
  it("still announces itself when it is only a crown", () => {
    render(<VipBadge size="icon" />);
    expect(screen.queryByText("VIP")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "VIP patient" })).toBeInTheDocument();
  });

  it("carries its meaning for a screen reader and on hover", () => {
    render(<VipBadge />);
    const badge = screen.getByRole("img", { name: "VIP patient" });
    expect(badge).toHaveAttribute("title", "VIP patient");
  });

  // Fifty animated pills in a day's appointments is fifty compositor layers on
  // a clinic PC. The sweep is opt-in, for the one-of-a-kind surfaces only.
  it("does not sweep unless asked", () => {
    const { container } = render(<VipBadge />);
    expect(container.querySelector(".vip-badge")).toBeTruthy();
    expect(container.querySelector(".vip-badge-shimmer")).toBeNull();
  });

  it("sweeps when asked", () => {
    const { container } = render(<VipBadge shimmer />);
    expect(container.querySelector(".vip-badge-shimmer")).toBeTruthy();
  });

  it("is gold at every size, because that is what carries the meaning", () => {
    for (const size of ["icon", "sm", "md"] as const) {
      const { container } = render(<VipBadge size={size} />);
      const badge = container.querySelector(".vip-badge");
      expect(badge?.className).toContain("--vip-surface");
      expect(badge?.className).toContain("--vip-ink");
    }
  });
});
