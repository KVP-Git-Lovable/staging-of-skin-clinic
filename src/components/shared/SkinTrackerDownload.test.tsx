import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SkinTracker } from "./SkinTracker";
import { renderComparison, saveBlob } from "@/lib/compareImage";
import { toast } from "sonner";

/**
 * Downloading the comparison.
 *
 * The one thing that must not break: what is saved is what is on screen. The
 * zoom, pan and tilt that line the two photos up live only in this component's
 * state, so a download that forgets to pass them produces a picture that looks
 * right, is wrong, and gives no sign of it.
 *
 * The drawing itself is covered in src/lib/compareExport.test.ts, against a
 * recorded canvas; here it is mocked out and only the handover is examined.
 */

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/compareImage", () => ({
  renderComparison: vi.fn(),
  saveBlob: vi.fn(),
}));

const photos = [
  { id: "p1", photo_url: "https://example.test/before.jpg", photo_type: "before", taken_at: "2026-01-05T10:00:00Z" },
  { id: "p2", photo_url: "https://example.test/after.jpg", photo_type: "after", taken_at: "2026-06-05T10:00:00Z" },
];

function renderCompared() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SkinTracker open onOpenChange={() => {}} photos={photos} patientName="Divyani Singh" />
    </QueryClientProvider>,
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

const download = () => screen.getByTestId("download-comparison");
const lastCall = () => vi.mocked(renderComparison).mock.calls.at(-1)![0];

beforeEach(() => {
  vi.mocked(renderComparison).mockReset();
  vi.mocked(renderComparison).mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  vi.mocked(saveBlob).mockReset();
  vi.mocked(toast.error).mockReset();
});

describe("the Download button", () => {
  it("appears only once there is something to compare", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SkinTracker open onOpenChange={() => {}} photos={photos} patientName="Divyani Singh" />
      </QueryClientProvider>,
    );
    expect(screen.queryByTestId("download-comparison")).toBeNull();
  });

  it("is offered as soon as both photos are chosen", () => {
    renderCompared();
    expect(download()).toBeInTheDocument();
    expect(download()).not.toBeDisabled();
  });

  it("does not replace the AI Analysis button", () => {
    // Added beside it, not instead of it.
    renderCompared();
    expect(screen.getByText("AI Analysis")).toBeInTheDocument();
  });

  it("saves both photos, in the mode being viewed", async () => {
    renderCompared();
    fireEvent.click(download());
    await waitFor(() => expect(renderComparison).toHaveBeenCalled());
    const opts = lastCall();
    expect(opts.mode).toBe("slider");
    expect(opts.before.url).toContain("before.jpg");
    expect(opts.after.url).toContain("after.jpg");
    // Where the divider was left. Omit it and the saved picture always splits
    // down the middle, whatever the doctor was actually looking at.
    expect(opts.sliderPercent).toBe(50);
  });

  it("carries the CURRENT zoom and tilt, not the defaults", async () => {
    // The whole point of the feature. Zoom photo 1 in twice and tilt photo 2
    // once, then save: those corrections must be in what is handed over.
    renderCompared();
    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));
    fireEvent.click(screen.getByLabelText("Zoom photo 1 in"));
    fireEvent.click(screen.getByLabelText("Tilt photo 2 right"));
    fireEvent.click(download());
    await waitFor(() => expect(renderComparison).toHaveBeenCalled());
    const opts = lastCall();
    expect(opts.before.view.zoom).toBeCloseTo(1.5);
    expect(opts.before.view.tiltDeg).toBe(0);
    expect(opts.after.view.zoom).toBe(1);
    expect(opts.after.view.tiltDeg).toBe(1);
  });

  it("follows the switch to Side by Side", async () => {
    renderCompared();
    const tab = screen.getByRole("tab", { name: /side by side/i });
    fireEvent.mouseDown(tab, { button: 0 });
    expect(tab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(download());
    await waitFor(() => expect(renderComparison).toHaveBeenCalled());
    expect(lastCall().mode).toBe("side-by-side");
  });

  it("names the file after the patient and both visit dates", async () => {
    renderCompared();
    fireEvent.click(download());
    await waitFor(() => expect(saveBlob).toHaveBeenCalled());
    const name = vi.mocked(saveBlob).mock.calls.at(-1)![1];
    expect(name).toContain("Divyani Singh");
    expect(name).toContain("05-01-2026");
    expect(name).toContain("05-06-2026");
    expect(name.endsWith(".png")).toBe(true);
  });

  it("puts the dates under the photos, as the screen does", async () => {
    renderCompared();
    fireEvent.click(download());
    await waitFor(() => expect(renderComparison).toHaveBeenCalled());
    const opts = lastCall();
    expect(opts.before.caption).toContain("Jan 5, 2026");
    expect(opts.after.caption).toContain("Jun 5, 2026");
  });

  it("says so when saving fails, and does not stay stuck on Saving", async () => {
    vi.mocked(renderComparison).mockRejectedValue(new Error("Could not read the photo (403)"));
    renderCompared();
    fireEvent.click(download());
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(vi.mocked(toast.error).mock.calls[0][0]).toContain("403");
    expect(saveBlob).not.toHaveBeenCalled();
    await waitFor(() => expect(download()).not.toBeDisabled());
  });
});
