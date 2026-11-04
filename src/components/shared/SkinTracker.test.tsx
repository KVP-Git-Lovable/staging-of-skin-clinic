import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkinTracker } from "./SkinTracker";

/**
 * Zoom and tilt on the before/after comparison.
 *
 * The rule these guard: both are per photo. A doctor reads these two images as
 * the same piece of skin at two dates, and the two were almost never taken
 * from the same distance or at the same angle - so scaling and straightening
 * one against the other is what makes them comparable at all.
 *
 * Zoom used to move both together, to stop one being blown up against the
 * other and a lesion made to look like it had changed. That risk did not go
 * away; it moved into the open, as a note shown whenever the two zooms differ,
 * which is the last test below.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const photos = [
  { id: "p1", photo_url: "https://example.test/before.jpg", photo_type: "before", taken_at: "2026-01-05T10:00:00Z" },
  { id: "p2", photo_url: "https://example.test/after.jpg", photo_type: "after", taken_at: "2026-06-05T10:00:00Z" },
];

/**
 * Opens the tracker with both photos chosen, which is when the controls appear.
 * The picker thumbnails carry alt="", so they are not exposed as images to a
 * screen reader and have to be found by src.
 */
function renderCompared() {
  render(
    // SkinTracker calls useQueryClient to refresh the AI repository after an
    // analysis, so it cannot render outside a provider.
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SkinTracker open onOpenChange={() => {}} photos={photos} patientName="Test Patient" />
    </QueryClientProvider>
  );
  const pick = (src: string) => {
    const img = document.body.querySelector(`img[src*="${src}"]`);
    if (!img) throw new Error(`no thumbnail for ${src}`);
    fireEvent.click(img);
  };
  fireEvent.click(screen.getAllByText("Select Photo")[0]);
  pick("before");
  fireEvent.click(screen.getByText("Select Photo"));
  pick("after");
}

/** The transforms actually applied to every rendered copy of one photo. */
const transforms = (src: string) =>
  Array.from(document.body.querySelectorAll<HTMLElement>(`img[src*="${src}"]`))
    .map((i) => i.style.transform)
    .filter(Boolean);

/**
 * One photo's zoom readout. Both photos show theirs, so it has to be read from
 * inside that photo's own group rather than by its text - the two say the same
 * thing at rest.
 */
const zoomReadout = (n: 1 | 2) =>
  screen.getByLabelText(`Zoom photo ${n} in`).previousElementSibling?.textContent ?? "";

/** The warning shown while the two photos are at different scales. */
const mismatchNote = () => screen.queryByText(/sizes are not comparable/i);

beforeEach(() => vi.clearAllMocks());

describe("zoom", () => {
  it("starts both photos at 1x with zoom out unavailable", () => {
    renderCompared();
    expect(zoomReadout(1)).toBe("1.0×");
    expect(zoomReadout(2)).toBe("1.0×");
    expect(screen.getByLabelText("Zoom photo 1 out").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Zoom photo 2 out").hasAttribute("disabled")).toBe(true);
  });

  it("scales one photo without touching the other", () => {
    renderCompared();
    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));

    expect(zoomReadout(1)).toBe("1.3×");
    expect(zoomReadout(2)).toBe("1.0×");
    for (const t of transforms("before")) expect(t).toContain("scale(1.25)");
    for (const t of transforms("after")) expect(t).toContain("scale(1)");
  });

  it("stops at the ends rather than running away", () => {
    renderCompared();
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByLabelText("Zoom photo 2 in"));

    expect(zoomReadout(2)).toBe("6.0×");
    expect(screen.getByLabelText("Zoom photo 2 in").hasAttribute("disabled")).toBe(true);
    // Forty clicks on one photo, and the other never moved.
    expect(zoomReadout(1)).toBe("1.0×");
  });
});

describe("tilt", () => {
  it("turns one photo without touching the other", () => {
    renderCompared();
    fireEvent.click(screen.getByLabelText("Tilt photo 1 right"));
    for (const t of transforms("before")) expect(t).toContain("rotate(1deg)");
    for (const t of transforms("after")) expect(t).toContain("rotate(0deg)");
  });

  it("turns both ways", () => {
    renderCompared();
    fireEvent.click(screen.getByLabelText("Tilt photo 2 left"));
    fireEvent.click(screen.getByLabelText("Tilt photo 2 left"));
    for (const t of transforms("after")) expect(t).toContain("rotate(-2deg)");
  });
});

describe("mismatched zoom", () => {
  it("is called out while the two differ, and goes quiet once they match", () => {
    renderCompared();
    // Both at 1x: nothing to warn about.
    expect(mismatchNote()).toBeNull();

    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));
    expect(mismatchNote()).not.toBeNull();

    // Bringing the second photo to the same scale makes them comparable again.
    fireEvent.click(screen.getByLabelText("Zoom photo 2 in"));
    expect(zoomReadout(1)).toBe(zoomReadout(2));
    expect(mismatchNote()).toBeNull();
  });
});

describe("reset view", () => {
  it("is offered only once something has been changed, and undoes all of it", () => {
    renderCompared();
    const resetButton = () => screen.getByRole("button", { name: /reset view/i });
    expect(resetButton().hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));
    fireEvent.click(screen.getByLabelText("Tilt photo 1 right"));
    expect(resetButton().hasAttribute("disabled")).toBe(false);

    fireEvent.click(resetButton());
    expect(zoomReadout(1)).toBe("1.0×");
    expect(zoomReadout(2)).toBe("1.0×");
    expect(mismatchNote()).toBeNull();
    for (const t of [...transforms("before"), ...transforms("after")]) {
      expect(t).toContain("scale(1)");
      expect(t).toContain("rotate(0deg)");
    }
  });
});

describe("side by side", () => {
  it("carries the same zoom and tilt as the slider", () => {
    renderCompared();
    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));
    fireEvent.click(screen.getByLabelText("Tilt photo 1 right"));
    fireEvent.click(screen.getByRole("tab", { name: /side by side/i }));

    // Whichever layout is showing, the same view settings apply - switching
    // between them must not quietly reset or double-apply anything.
    for (const t of transforms("before")) {
      expect(t).toContain("scale(1.25)");
      expect(t).toContain("rotate(1deg)");
    }
    for (const t of transforms("after")) {
      expect(t).toContain("scale(1)");
      expect(t).toContain("rotate(0deg)");
    }
  });
});
