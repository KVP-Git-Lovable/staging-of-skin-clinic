import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PhotoViewer, type ViewablePhoto } from "./PhotoViewer";

const PHOTOS: ViewablePhoto[] = [
  { id: "a", photo_url: "https://cdn.test/a.jpg", taken_at: "2026-09-10T04:30:00Z", procedures: { service_name: "Laser Toning" } },
  { id: "b", photo_url: "https://cdn.test/b.jpg", taken_at: "2026-09-11T04:30:00Z", procedures: null },
  { id: "c", photo_url: "https://cdn.test/c.jpg", taken_at: null, procedures: { service_name: "GFC" } },
];

function Harness({ start, photos = PHOTOS }: { start: number | null; photos?: ViewablePhoto[] }) {
  const [index, setIndex] = useState<number | null>(start);
  return <PhotoViewer photos={photos} index={index} onIndexChange={setIndex} patientName="Asha Rao" />;
}

// Exactly one <img> is on screen at a time, so role is the stable handle - the
// alt text varies with whether the photo has a service or a date.
const shownImage = () => screen.getByRole("img") as HTMLImageElement;

describe("PhotoViewer", () => {
  it("shows nothing until a photo is chosen", () => {
    render(<Harness start={null} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the photo that was clicked, not the first one", () => {
    render(<Harness start={2} />);
    expect(shownImage().src).toBe("https://cdn.test/c.jpg");
  });

  it("shows the image whole rather than cropped", () => {
    // The grid crops to a tidy square; the whole point of opening one is to see
    // all of it, so a lesion at the edge of frame is not cut off.
    render(<Harness start={0} />);
    expect(shownImage().className).toContain("object-contain");
    expect(shownImage().className).not.toContain("object-cover");
  });

  it("steps forward and back through the set", () => {
    render(<Harness start={0} />);
    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(shownImage().src).toBe("https://cdn.test/b.jpg");
    fireEvent.click(screen.getByLabelText("Previous photo"));
    expect(shownImage().src).toBe("https://cdn.test/a.jpg");
  });

  it("moves with the arrow keys, which is how anyone compares visits", () => {
    render(<Harness start={0} />);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(shownImage().src).toBe("https://cdn.test/b.jpg");
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(shownImage().src).toBe("https://cdn.test/a.jpg");
  });

  it("wraps at both ends instead of dead-ending", () => {
    render(<Harness start={0} />);
    fireEvent.click(screen.getByLabelText("Previous photo"));
    expect(shownImage().src).toBe("https://cdn.test/c.jpg");
    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(shownImage().src).toBe("https://cdn.test/a.jpg");
  });

  it("says where you are in the set", () => {
    render(<Harness start={1} />);
    expect(screen.getByText("2 of 3")).toBeInTheDocument();
  });

  it("hides the arrows when there is only one photo", () => {
    render(<Harness start={0} photos={[PHOTOS[0]]} />);
    expect(screen.queryByLabelText("Next photo")).toBeNull();
    expect(screen.queryByText(/of 1/)).toBeNull();
  });

  it("captions with the service and the date it was taken, as dd/MM/yyyy", () => {
    render(<Harness start={0} />);
    // Asserted literally, not via toLocaleDateString: this caption used to
    // follow the machine's region, so a 10 September photo read "9/10/2026" on
    // a US-configured clinic PC and was taken for the 9th of October.
    expect(screen.getByText("Laser Toning · 10/09/2026")).toBeInTheDocument();
  });

  it("does not print Invalid Date when the date is missing or unusable", () => {
    render(<Harness start={2} />);
    expect(screen.queryByText(/Invalid Date/)).toBeNull();
    expect(screen.getByText("GFC")).toBeInTheDocument();
  });

  it("says so when the photo will not load, rather than showing a broken frame", () => {
    render(<Harness start={0} />);
    fireEvent.error(shownImage());
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });

  it("gives a failed photo's neighbour a fresh chance to load", () => {
    // Without resetting on change, one broken photo would make every photo
    // after it look broken too.
    render(<Harness start={0} />);
    fireEvent.error(shownImage());
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Next photo"));
    expect(screen.queryByText(/could not be loaded/i)).toBeNull();
    expect(shownImage().src).toBe("https://cdn.test/b.jpg");
  });

  describe("downloading", () => {
    // The photos come from another origin, where a plain link's download
    // attribute is ignored. These hold the fetch-and-save that gets round it,
    // and the fallback for when it cannot.
    let saved: { name: string; href: string } | null;
    let opened: string | null;

    beforeEach(() => {
      saved = null;
      opened = null;
      vi.stubGlobal("URL", Object.assign(Object.create(URL), {
        createObjectURL: () => "blob:photo",
        revokeObjectURL: () => {},
      }));
      vi.spyOn(window, "open").mockImplementation((url) => { opened = String(url); return null; });
      // What the anchor was asked to save, rather than the anchor itself -
      // it is removed and its blob URL revoked the moment the click returns.
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        saved = { name: this.download, href: this.href };
      });
    });
    afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

    it("offers a download, not a link to open by hand", () => {
      render(<Harness start={0} />);
      expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
      expect(screen.queryByRole("link", { name: /open original/i })).toBeNull();
    });

    it("fetches the photo and saves it under a name that says who it is", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true, blob: async () => new Blob(["x"], { type: "image/jpeg" }),
      }));
      render(<Harness start={0} />);
      fireEvent.click(screen.getByRole("button", { name: /download/i }));

      await waitFor(() => expect(saved).not.toBeNull());
      expect(fetch).toHaveBeenCalledWith("https://cdn.test/a.jpg");
      expect(saved!.name).toBe("Asha Rao - Laser Toning - 10-09-2026.jpg");
      expect(opened).toBeNull();
    });

    it("opens the photo instead when the download fails, rather than doing nothing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
      render(<Harness start={0} />);
      fireEvent.click(screen.getByRole("button", { name: /download/i }));

      await waitFor(() => expect(opened).toBe("https://cdn.test/a.jpg"));
      expect(saved).toBeNull();
    });

    it("treats a non-OK response as a failure too", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));
      render(<Harness start={0} />);
      fireEvent.click(screen.getByRole("button", { name: /download/i }));

      await waitFor(() => expect(opened).toBe("https://cdn.test/a.jpg"));
    });
  });

  it("names the patient for a screen reader", () => {
    render(<Harness start={0} />);
    expect(screen.getByText(/Photo of Asha Rao/)).toBeInTheDocument();
  });
});
