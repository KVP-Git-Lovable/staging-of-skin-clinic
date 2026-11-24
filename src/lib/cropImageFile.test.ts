import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JPEG_QUALITY, cropImageFile, loadImageFile, outputName, outputType } from "@/lib/cropImageFile";

/**
 * Turning a crop rectangle into a file that can be uploaded.
 *
 * The canvas is faked the way src/lib/compareImage.test.ts fakes it - jsdom
 * has no 2D context - so what is asserted is the geometry handed to it and
 * the format written out.
 */

let calls: { op: string; args: unknown[] }[] = [];
let canvasEl: ReturnType<typeof fakeCanvas>;
let ctx: Record<string, unknown>;

const OPS = ["save", "restore", "translate", "rotate", "drawImage"];

function fakeCanvas() {
  calls = [];
  ctx = {};
  for (const op of OPS) ctx[op] = (...args: unknown[]) => calls.push({ op, args });
  return {
    width: 0,
    height: 0,
    getContext: () => ctx as unknown as CanvasRenderingContext2D,
    // Honours the requested type and quality: a fake that always said PNG
    // would let the format silently change and nobody would notice.
    toBlob: (cb: (b: Blob | null) => void, type?: string, quality?: number) => {
      calls.push({ op: "toBlob", args: [type, quality] });
      cb(new Blob(["img"], { type: type || "image/png" }));
    },
  };
}

const realCreate = document.createElement.bind(document);

/** An Image that loads, reporting a 4000x3000 page. */
function imageLoads(width = 4000, height = 3000) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
  }
  vi.stubGlobal("Image", FakeImage);
}

function imageFails() {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_v: string) { setTimeout(() => this.onerror?.(), 0); }
  }
  vi.stubGlobal("Image", FakeImage);
}

beforeEach(() => {
  canvasEl = fakeCanvas();
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? canvasEl : realCreate(tag)) as typeof document.createElement);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  imageLoads();
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const jpeg = (name = "IMG_0421.jpg") => new File(["x"], name, { type: "image/jpeg" });

describe("what format comes out", () => {
  it("keeps a PNG a PNG", () => {
    // A screenshot of typed text saved as JPEG picks up artefacts around the
    // letters.
    expect(outputType(new File([""], "scan.png", { type: "image/png" }))).toBe("image/png");
    expect(outputType(new File([""], "scan.PNG", { type: "" }))).toBe("image/png");
  });

  it("writes everything else as JPEG", () => {
    // A photographed page saved as PNG is several times the size for no gain.
    expect(outputType(jpeg())).toBe("image/jpeg");
    expect(outputType(new File([""], "scan.webp", { type: "image/webp" }))).toBe("image/jpeg");
  });

  it("gives the name a suffix that matches what was written", () => {
    expect(outputName("IMG_0421.heic", "image/jpeg")).toBe("IMG_0421.jpg");
    expect(outputName("scan.png", "image/png")).toBe("scan.png");
    expect(outputName("no-suffix", "image/jpeg")).toBe("no-suffix.jpg");
    expect(outputName("", "image/jpeg")).toBe("attachment.jpg");
  });

  it("does not mistake a dot in a folder name for a suffix", () => {
    expect(outputName("a.b/scan", "image/jpeg")).toBe("a.b/scan.jpg");
  });
});

describe("cropping", () => {
  it("sizes the canvas to the crop, not to the picture", async () => {
    await cropImageFile(jpeg(), { x: 100, y: 200, width: 1500, height: 900 });
    expect(canvasEl.width).toBe(1500);
    expect(canvasEl.height).toBe(900);
  });

  it("draws the chosen region of the original", async () => {
    await cropImageFile(jpeg(), { x: 100, y: 200, width: 1500, height: 900 });
    const draw = calls.find((c) => c.op === "drawImage");
    expect(draw?.args.slice(1, 5)).toEqual([100, 200, 1500, 900]);
  });

  it("swaps the sides on a quarter turn", async () => {
    await cropImageFile(jpeg(), { x: 0, y: 0, width: 1500, height: 900 }, 1);
    expect(canvasEl.width).toBe(900);
    expect(canvasEl.height).toBe(1500);
    expect(calls.find((c) => c.op === "rotate")?.args[0]).toBeCloseTo(Math.PI / 2);
  });

  it("does not swap them on a half turn", async () => {
    await cropImageFile(jpeg(), { x: 0, y: 0, width: 1500, height: 900 }, 2);
    expect(canvasEl.width).toBe(1500);
    expect(canvasEl.height).toBe(900);
  });

  it("turns the other way on a negative press", async () => {
    await cropImageFile(jpeg(), { x: 0, y: 0, width: 1500, height: 900 }, -1);
    expect(canvasEl.width).toBe(900);
    expect(calls.find((c) => c.op === "rotate")?.args[0]).toBeCloseTo((3 * Math.PI) / 2);
  });

  it("writes JPEG at the quality the clinic's pages need", async () => {
    await cropImageFile(jpeg(), { x: 0, y: 0, width: 100, height: 100 });
    expect(calls.find((c) => c.op === "toBlob")?.args).toEqual(["image/jpeg", JPEG_QUALITY]);
  });

  it("writes PNG with no quality at all", async () => {
    await cropImageFile(new File(["x"], "scan.png", { type: "image/png" }), { x: 0, y: 0, width: 100, height: 100 });
    expect(calls.find((c) => c.op === "toBlob")?.args).toEqual(["image/png", undefined]);
  });

  it("hands back a real file, named and typed", async () => {
    const out = await cropImageFile(jpeg("Consent Form.jpeg"), { x: 0, y: 0, width: 100, height: 100 });
    expect(out.name).toBe("Consent Form.jpg");
    expect(out.type).toBe("image/jpeg");
  });

  it("never asks for a canvas of nothing", async () => {
    // A zero-width canvas throws in some browsers and draws nothing in the rest.
    await cropImageFile(jpeg(), { x: 0, y: 0, width: 0.2, height: 0.2 });
    expect(canvasEl.width).toBeGreaterThanOrEqual(1);
    expect(canvasEl.height).toBeGreaterThanOrEqual(1);
  });
});

describe("a picture the browser cannot open", () => {
  it("says so rather than returning an empty file", async () => {
    // An iPhone .heic chosen from Files is the real case. The caller keeps
    // the original - cropping is an improvement, never a gate on the upload.
    imageFails();
    await expect(loadImageFile(new File(["x"], "IMG_0001.heic", { type: "image/heic" })))
      .rejects.toThrow(/could not be opened/i);
    await expect(cropImageFile(new File(["x"], "IMG_0001.heic"), { x: 0, y: 0, width: 10, height: 10 }))
      .rejects.toThrow();
  });

  it("lets go of the object URL either way", async () => {
    imageFails();
    await loadImageFile(new File(["x"], "a.heic")).catch(() => {});
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
