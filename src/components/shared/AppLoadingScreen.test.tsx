import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AppLoadingScreen, SLOW_LOADING_MS } from "./AppLoadingScreen";

afterEach(() => vi.useRealTimers());

describe("AppLoadingScreen", () => {
  it("shows something while loading, never a blank page", () => {
    vi.useFakeTimers();
    render(<AppLoadingScreen />);
    expect(screen.getByRole("status").textContent).toContain("Loading The Skin Clinic");
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
  });

  it("offers Reload once loading has taken 10 seconds", () => {
    vi.useFakeTimers();
    render(<AppLoadingScreen />);
    act(() => { vi.advanceTimersByTime(SLOW_LOADING_MS - 1); });
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
    expect(SLOW_LOADING_MS).toBe(10_000);
  });
});

describe("AppLoadingScreen between pages", () => {
  it("keeps the small spinner at first, then offers Reload after 10 seconds", () => {
    vi.useFakeTimers();
    render(<AppLoadingScreen variant="spinner" />);
    expect(screen.queryByRole("button", { name: "Reload" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
    act(() => { vi.advanceTimersByTime(SLOW_LOADING_MS); });
    expect(screen.getByRole("button", { name: "Reload" })).toBeTruthy();
  });
});
