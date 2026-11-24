import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * Trimming a photographed page before it is uploaded.
 *
 * The two things that must not go wrong: "Use full photo" hands back the
 * ORIGINAL file rather than a re-encode of it, and a picture the browser
 * cannot open still reaches the upload.
 */

const cropped = vi.fn(async (file: File) => new File(["cropped"], "cropped.jpg", { type: "image/jpeg" }));
let loadFails = false;

vi.mock("@/lib/cropImageFile", () => ({
  cropImageFile: (file: File) => cropped(file),
  loadImageFile: async () => {
    if (loadFails) throw new Error("This picture could not be opened for cropping");
    return { naturalWidth: 4000, naturalHeight: 3000 } as HTMLImageElement;
  },
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

import { ImageCropDialog } from "@/components/shared/ImageCropDialog";

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

const ORIGINAL = new File(["x"], "IMG_0421.jpg", { type: "image/jpeg" });

/**
 * Which file came back - by identity, never by equality.
 *
 * A File keeps name, size and type on its prototype, so two different Files
 * are deep-equal to vitest and toHaveBeenCalledWith(ORIGINAL) passes for a
 * cropped one too. Found by mutation testing: dropping the "was it cropped"
 * check survived until these became identity assertions.
 */
const handedBack = (onDone: ReturnType<typeof vi.fn>) => onDone.mock.calls.at(-1)?.[0] as File | undefined;

function open(onDone = vi.fn()) {
  render(<ImageCropDialog open file={ORIGINAL} onOpenChange={vi.fn()} onDone={onDone} />);
  return onDone;
}

beforeEach(() => { cropped.mockClear(); toastError.mockClear(); loadFails = false; });

describe("what it offers", () => {
  it("puts a handle on every corner, each one named", async () => {
    open();
    for (const label of ["Top left", "Top right", "Bottom left", "Bottom right"]) {
      expect(await screen.findByLabelText(label)).toBeInTheDocument();
    }
  });

  it("offers turning it either way, and starting again", () => {
    open();
    expect(screen.getByRole("button", { name: /Left/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Right/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset/ })).toBeInTheDocument();
  });
});

describe("using the photo as it is", () => {
  it("hands back the very same file, never a re-encode", async () => {
    // On a page of small handwriting a needless re-encode is the difference
    // between legible and not.
    const onDone = open();
    fireEvent.click(screen.getByRole("button", { name: "Use full photo" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handedBack(onDone)).toBe(ORIGINAL);
    expect(cropped).not.toHaveBeenCalled();
  });

  it("does not re-encode when Crop is pressed without moving anything", async () => {
    const onDone = open();
    await screen.findByLabelText("Top left");
    fireEvent.click(screen.getByRole("button", { name: /Crop & Continue/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handedBack(onDone)).toBe(ORIGINAL);
    expect(cropped).not.toHaveBeenCalled();
  });

  it("still means the FULL photo after they have already turned it", async () => {
    // "Use full photo" is the way out of a crop somebody started and thought
    // better of. It must hand back the original, not whatever is on screen.
    const onDone = open();
    await screen.findByLabelText("Top left");
    fireEvent.click(screen.getByRole("button", { name: /Right/ }));
    await waitFor(() => expect(cropped).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Use full photo" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handedBack(onDone)).toBe(ORIGINAL);
  });

  it("DOES re-encode once it has been turned, even with the whole picture", async () => {
    const onDone = open();
    await screen.findByLabelText("Top left");
    fireEvent.click(screen.getByRole("button", { name: /Right/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crop & Continue/ }));
    await waitFor(() => expect(cropped).toHaveBeenCalled());
    expect(handedBack(onDone)).not.toBe(ORIGINAL);
    expect(handedBack(onDone)?.name).toBe("cropped.jpg");
  });
});

describe("a picture that cannot be opened", () => {
  beforeEach(() => { loadFails = true; });

  it("says so instead of showing a broken cropper", async () => {
    open();
    expect(await screen.findByText(/cannot be cropped here/i)).toBeInTheDocument();
  });

  it("still lets it be uploaded as it is", async () => {
    // Cropping is an improvement, never a gate on the upload.
    const onDone = open();
    await screen.findByText(/cannot be cropped here/i);
    const useFull = screen.getByRole("button", { name: "Use full photo" });
    expect(useFull).not.toBeDisabled();
    fireEvent.click(useFull);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handedBack(onDone)).toBe(ORIGINAL);
  });
});

describe("when the crop itself fails", () => {
  it("keeps the original rather than losing the photo", async () => {
    cropped.mockRejectedValueOnce(new Error("The cropped picture could not be saved"));
    const onDone = open();
    await screen.findByLabelText("Top left");
    fireEvent.click(screen.getByRole("button", { name: /Right/ }));
    fireEvent.click(screen.getByRole("button", { name: /Crop & Continue/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(handedBack(onDone)).toBe(ORIGINAL);
    expect(toastError).toHaveBeenCalled();
  });
});

describe("built for a phone", () => {
  const source = code("src/components/shared/ImageCropDialog.tsx");

  it("stops a drag from scrolling the page instead of cropping", () => {
    expect(source).toContain('touchAction: "none"');
  });

  it("uses pointer events, so a finger and a mouse are one code path", () => {
    expect(source).toContain("onPointerDown");
    expect(source).toContain("onPointerMove");
    expect(source).toContain("setPointerCapture");
    expect(source).not.toContain("onMouseDown");
  });
});

describe("the attachments screen sends photos through it", () => {
  const source = code("src/components/patients/PatientAttachments.tsx");

  it("crops a camera photo before it becomes a pending file", () => {
    const at = source.indexOf("onCapture={(file) => {");
    const end = source.indexOf("}}", at);
    expect(at).toBeGreaterThan(-1);
    const body = source.slice(at, end);
    expect(body).toContain("setCropping({ file, index: null })");
    expect(body).not.toContain("setPendingFiles");
  });

  it("offers Crop on a picture that was uploaded rather than photographed", () => {
    expect(source).toContain('attachmentKind(f.name, "") === "image"');
    expect(source).toContain("setCropping({ file: f, index: i })");
  });

  it("replaces only the picture that was cropped", () => {
    expect(source).toContain("current.map((f, i) => (i === at ? file : f))");
  });
});
