import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfPreviewDialog } from "./PdfPreviewDialog";

afterEach(cleanup);

describe("prescription print readiness", () => {
  it("waits for the frame document and its page images before auto-printing once", async () => {
    render(<PdfPreviewDialog open onClose={() => {}} title="Prescription" preparing="Preparing" pages={["data:image/png;base64,AAA"]} autoPrint />);
    const frame = screen.getByTitle("print") as HTMLIFrameElement;
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) throw new Error("Missing print frame");
    const print = vi.spyOn(win, "print").mockImplementation(() => {});
    vi.spyOn(win, "focus").mockImplementation(() => {});

    // An early load of the initial about:blank document must not qualify.
    fireEvent.load(frame);
    expect(print).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Print$/ })).toBeDisabled();

    const image = doc.createElement("img");
    doc.body.append(image);
    Object.defineProperty(image, "complete", { value: false, configurable: true });
    Object.defineProperty(image, "naturalWidth", { value: 0, configurable: true });
    fireEvent.load(frame);
    expect(print).not.toHaveBeenCalled();

    Object.defineProperty(image, "complete", { value: true });
    Object.defineProperty(image, "naturalWidth", { value: 800 });
    fireEvent.load(frame);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    fireEvent.load(frame);
    expect(print).toHaveBeenCalledTimes(1);
  });
});