import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderComparison, saveBlob } from "./compareImage";
import { compareLayout } from "./compareExport";

/**
 * The composition: which photo goes down first, where the divider lands, and
 * where the dates are written.
 *
 * jsdom has no canvas, so one is faked and every call recorded. The geometry
 * itself is proven in compareExport.test.ts; what is checked here is the order
 * things are painted in, which is where a comparison goes quietly wrong - the
 * two photos swapped around the divider look entirely plausible and are the
 * wrong way round.
 */

type Call = { op: string; args: unknown[] };
let calls: Call[];
let ctx: Record<string, unknown>;

const OPS = ["save", "restore", "beginPath", "rect", "clip", "translate", "scale", "rotate", "drawImage", "fillRect", "fillText"];

function fakeCanvas() {
  calls = [];
  ctx = { fillStyle: "", font: "", textAlign: "left", textBaseline: "alphabetic", measureText: (t: string) => ({ width: t.length }) };
  for (const op of OPS) ctx[op] = (...args: unknown[]) => calls.push({ op, args });
  return {
    width: 0,
    height: 0,
    getContext: () => ctx,
    // Honours the requested type: a fake that always says PNG would let the
    // format silently change to JPEG, which is the one thing a clinical
    // before/after must not do.
    toBlob: (cb: (b: Blob | null) => void, type?: string) =>
      cb(new Blob(["img"], { type: type || "image/png" })),
  };
}

const realCreate = document.createElement.bind(document);
let canvasEl: ReturnType<typeof fakeCanvas>;

beforeEach(() => {
  canvasEl = fakeCanvas();
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
    tag === "canvas" ? canvasEl : realCreate(tag)) as typeof document.createElement);

  // Each fetched photo keeps its URL all the way through to the canvas, so a
  // test can say WHICH image was drawn first - the difference between a
  // correct comparison and one with the two dates under the wrong photos.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    blob: async () => Object.assign(new Blob(["jpg"]), { tag: url }),
  })));
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: (b: Blob & { tag?: string }) => `blob:${b.tag ?? "?"}`,
    revokeObjectURL: () => {},
  });
  // A real Image never loads a fake blob URL, so decoding is simulated.
  class FakeImage {
    width = 1000;
    height = 1000;
    from = "";
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(v: string) {
      this.from = v;
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const photo = (url: string, caption: string) => ({
  url,
  caption,
  view: { zoom: 1, tiltDeg: 0, pan: { x: 0, y: 0 } },
  boxWidthOnScreen: 400,
});

const drawIndexes = () => calls.map((c, i) => ({ ...c, i })).filter((c) => c.op === "drawImage").map((c) => c.i);
/** Which photo each drawImage painted, in order. */
const drawOrder = () =>
  calls.filter((c) => c.op === "drawImage").map((c) => String((c.args[0] as { from?: string }).from ?? ""));
const texts = () => calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0]));

describe("slider mode", () => {
  it("lays Photo 2 down first and Photo 1 over its left part", async () => {
    // The order the component stacks them in. Reversed, each date would sit
    // under the other patient's photo.
    await renderComparison({
      mode: "slider",
      sliderPercent: 40,
      before: photo("b.jpg", "Jan 5, 2026"),
      after: photo("a.jpg", "Jun 5, 2026"),
    });
    const draws = drawIndexes();
    expect(draws).toHaveLength(2);
    expect(drawOrder()).toEqual(["blob:a.jpg", "blob:b.jpg"]);
    // Between the two draws there must be a clip: that is the left part.
    const clips = calls.map((c, i) => ({ ...c, i })).filter((c) => c.op === "clip").map((c) => c.i);
    expect(clips.some((i) => i > draws[0] && i < draws[1])).toBe(true);
  });

  it("cuts at the divider position, not down the middle", async () => {
    await renderComparison({
      mode: "slider",
      sliderPercent: 40,
      before: photo("b.jpg", "a"),
      after: photo("a.jpg", "b"),
    });
    const layout = compareLayout("slider", 40);
    const widths = calls.filter((c) => c.op === "rect").map((c) => Number(c.args[2]));
    expect(widths).toContain(layout.dividerX! - layout.before.x);
  });

  it("writes one date at each end", async () => {
    await renderComparison({
      mode: "slider",
      before: photo("b.jpg", "Jan 5, 2026"),
      after: photo("a.jpg", "Jun 5, 2026"),
    });
    expect(texts()).toEqual(["Jan 5, 2026", "Jun 5, 2026"]);
  });
});

describe("side by side", () => {
  it("draws each photo in its own box, left then right", async () => {
    await renderComparison({
      mode: "side-by-side",
      before: photo("b.jpg", "Jan 5, 2026"),
      after: photo("a.jpg", "Jun 5, 2026"),
    });
    const layout = compareLayout("side-by-side");
    const rects = calls.filter((c) => c.op === "rect").map((c) => Number(c.args[0]));
    expect(rects).toContain(layout.before.x);
    expect(rects).toContain(layout.after.x);
    expect(drawOrder()).toEqual(["blob:b.jpg", "blob:a.jpg"]);
  });

  it("writes both captions", async () => {
    await renderComparison({
      mode: "side-by-side",
      before: photo("b.jpg", "Jan 5, 2026 · Laser"),
      after: photo("a.jpg", "Jun 5, 2026 · Laser"),
    });
    expect(texts()).toEqual(["Jan 5, 2026 · Laser", "Jun 5, 2026 · Laser"]);
  });
});

describe("the canvas itself", () => {
  it("is sized to the layout and returns a PNG", async () => {
    const blob = await renderComparison({
      mode: "side-by-side",
      before: photo("b.jpg", "a"),
      after: photo("a.jpg", "b"),
    });
    const layout = compareLayout("side-by-side");
    expect(canvasEl.width).toBe(layout.width);
    expect(canvasEl.height).toBe(layout.height);
    expect(blob.type).toBe("image/png");
  });

  it("says so when a photo cannot be read, rather than saving a blank", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, blob: async () => new Blob([]) })));
    await expect(
      renderComparison({ mode: "slider", before: photo("b.jpg", "a"), after: photo("a.jpg", "b") }),
    ).rejects.toThrow(/403/);
  });
});

describe("saveBlob", () => {
  it("hands the browser a named download and cleans up after itself", () => {
    const link = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "a" ? link : realCreate(tag)) as typeof document.createElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(((n: Node) => n) as typeof document.body.appendChild);
    const revoke = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:out", revokeObjectURL: revoke });

    saveBlob(new Blob(["x"]), "Patient - comparison.png");
    expect(link.download).toBe("Patient - comparison.png");
    expect(link.click).toHaveBeenCalled();
    expect(link.remove).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:out");
  });
});
