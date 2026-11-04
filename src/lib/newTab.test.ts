import { describe, it, expect, vi, afterEach } from "vitest";
import { reserveTab } from "./newTab";

/** A stand-in for a real tab that records what was done to it. */
function fakeWindow() {
  return {
    document: { written: [] as string[], write(html: string) { this.written.push(html); }, close: vi.fn() },
    location: { href: "about:blank" },
    opener: {} as unknown,
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("reserveTab", () => {
  it("opens the tab during the call, not after the work finishes", async () => {
    const open = vi.fn(() => fakeWindow());
    vi.stubGlobal("open", open);

    // What a handler does: reserve, then go away and build something.
    const tab = reserveTab();
    expect(open).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 0));
    tab.navigate("https://example.test/a.pdf");

    // Still only the one open - nothing is opened after the await, which is
    // exactly what the browser would have blocked.
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("shows a placeholder so the tab is not blank while the PDF builds", () => {
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab("Preparing the invoice…");

    expect(win.document.written.join("")).toContain("Preparing the invoice…");
  });

  it("sends the reserved tab to the finished document and severs the opener", () => {
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab().navigate("https://example.test/B-46700.pdf");

    expect(win.location.href).toBe("https://example.test/B-46700.pdf");
    expect(win.opener).toBeNull();
  });

  it("replaces the placeholder when we write our own document", () => {
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab().write("<html>invoice</html>");

    expect(win.document.written.at(-1)).toBe("<html>invoice</html>");
    expect(win.document.close).toHaveBeenCalled();
  });

  it("prints after giving the document a moment to lay out", () => {
    vi.useFakeTimers();
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab().print(400);
    expect(win.print).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(win.focus).toHaveBeenCalled();
    expect(win.print).toHaveBeenCalled();
  });

  it("says why nothing is coming rather than leaving the spinner up", () => {
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab("Preparing the prescription…").fail("The prescription is taking longer than usual.");

    const shown = win.document.written.at(-1) ?? "";
    expect(shown).toContain("The prescription is taking longer than usual.");
    expect(shown).not.toContain("Preparing the prescription…");
  });

  it("closes the tab when the work fails", () => {
    const win = fakeWindow();
    vi.stubGlobal("open", () => win);

    reserveTab().cancel();

    expect(win.close).toHaveBeenCalled();
  });

  it("reports blocked when the browser refuses even the synchronous open", () => {
    vi.stubGlobal("open", () => null);

    const tab = reserveTab();

    expect(tab.blocked).toBe(true);
    // And stays harmless rather than throwing on a null window.
    expect(() => tab.navigate("https://example.test/a.pdf")).not.toThrow();
    expect(() => tab.write("<html></html>")).not.toThrow();
    expect(() => tab.cancel()).not.toThrow();
  });

  it("reports blocked when window.open throws outright", () => {
    vi.stubGlobal("open", () => { throw new Error("blocked by policy"); });

    expect(reserveTab().blocked).toBe(true);
  });
});
