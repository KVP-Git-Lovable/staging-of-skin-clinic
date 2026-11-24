import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  NO_OFFSET, ZOOM_DOUBLE, ZOOM_MAX, ZOOM_MIN, canPan, clampPan, clampZoom,
  nextZoom, toggleZoom, zoomLabel, zoomTransform,
} from "./imageZoom";

/**
 * Reading a dose written in biro.
 *
 * The clinic's attachments are photographs of handwriting. The preview showed
 * them at max-h-[70vh] object-contain - a whole A4 page in about 500 pixels -
 * and staff were downloading files to read the second line.
 */

describe("clampZoom", () => {
  it("holds the range the skin tracker already uses", () => {
    expect(ZOOM_MIN).toBe(1);
    expect(ZOOM_MAX).toBe(6);
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(99)).toBe(6);
    expect(clampZoom(2.5)).toBe(2.5);
  });

  it("never lets a bad number through", () => {
    expect(clampZoom(Number.NaN)).toBe(1);
    expect(clampZoom(Number.POSITIVE_INFINITY)).toBe(6);
  });
});

describe("nextZoom", () => {
  it("steps in and out", () => {
    expect(nextZoom(1, 1)).toBe(1.5);
    expect(nextZoom(1.5, 1)).toBe(2);
    expect(nextZoom(2, -1)).toBe(1.5);
  });

  it("stops at both ends rather than running away", () => {
    expect(nextZoom(1, -1)).toBe(1);
    expect(nextZoom(6, 1)).toBe(6);
  });

  it("does not drift off the step over many presses", () => {
    // 0.5 added repeatedly in floating point is how 2.9999999999999996 gets
    // onto a screen as "300%".
    let z = ZOOM_MIN;
    for (let i = 0; i < 10; i++) z = nextZoom(z, 1);
    expect(z).toBe(6);
    for (let i = 0; i < 10; i++) z = nextZoom(z, -1);
    expect(z).toBe(1);
  });
});

describe("toggleZoom", () => {
  it("goes in from the fit and out from anywhere else", () => {
    expect(toggleZoom(1)).toBe(ZOOM_DOUBLE);
    expect(toggleZoom(ZOOM_DOUBLE)).toBe(1);
    expect(toggleZoom(6)).toBe(1);
  });
});

describe("zoomLabel", () => {
  it("reads as a percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(2.5)).toBe("250%");
    expect(zoomLabel(1.5)).toBe("150%");
    // It takes any scale, not only one a step produced, so it rounds.
    expect(zoomLabel(1.337)).toBe("134%");
    expect(zoomLabel(2.004)).toBe("200%");
    // And it clamps first, so the readout can never disagree with what the
    // buttons will actually do.
    expect(zoomLabel(99)).toBe("600%");
    expect(zoomLabel(0.1)).toBe("100%");
  });
});

describe("canPan", () => {
  it("is pointless at the fit", () => {
    expect(canPan(1)).toBe(false);
    expect(canPan(1.5)).toBe(true);
  });
});

describe("clampPan", () => {
  const frame = { width: 800, height: 600 };

  it("keeps the image overlapping its frame", () => {
    // Without a bound somebody flings the prescription off the side and is
    // left looking at an empty grey box.
    expect(clampPan({ x: 9999, y: 9999 }, 2, frame)).toEqual({ x: 400, y: 300 });
    expect(clampPan({ x: -9999, y: -9999 }, 2, frame)).toEqual({ x: -400, y: -300 });
  });

  it("allows what is inside the bound", () => {
    expect(clampPan({ x: 100, y: -50 }, 2, frame)).toEqual({ x: 100, y: -50 });
  });

  it("snaps back to centre at the fit, where there is no travel", () => {
    expect(clampPan({ x: 300, y: 300 }, 1, frame)).toEqual(NO_OFFSET);
  });

  it("copes with a frame that has not been measured yet", () => {
    expect(clampPan({ x: 50, y: 50 }, 2, { width: 0, height: 0 })).toEqual(NO_OFFSET);
  });

  it("does not pass a bad number on to a transform", () => {
    expect(clampPan({ x: Number.NaN, y: 10 }, 2, frame)).toEqual({ x: 0, y: 10 });
  });
});

describe("zoomTransform", () => {
  it("translates then scales", () => {
    // Order matters: scale first and the translation is multiplied by it.
    expect(zoomTransform(2, { x: 10, y: -5 })).toBe("translate(10px, -5px) scale(2)");
  });

  it("ignores a stale offset at the fit", () => {
    expect(zoomTransform(1, { x: 80, y: 80 })).toBe("translate(0px, 0px) scale(1)");
  });
});

describe("the attachments list", () => {
  const src = () =>
    readFileSync("src/components/patients/PatientAttachments.tsx", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("lets the type be changed from the card", () => {
    // It was settled once at upload and applied to the whole batch, so one
    // wrong pick on seven scans needed seven deletes to undo.
    const page = src();
    expect(page).toMatch(/data-testid=\{`doc-type-\$\{att\.id\}`\}/);
    expect(page).toMatch(/setDocumentType\.mutate\(\{ id: att\.id, type \}\)/);
  });

  it("writes the change and checks it landed", () => {
    const body = src().split("const setDocumentType")[1].split("const handleUpload")[0];
    expect(body).toMatch(/from\("procedure_attachments"\)[\s\S]*?\.update\(\{ document_type: type \}\)/);
    expect(body).toMatch(/\.eq\("id", id\)/);
    expect(body).toMatch(/\.select\("id"\)/);
    expect(body).toMatch(/!data \|\| data\.length === 0/);
  });

  it("does not write when the type did not change", () => {
    expect(src()).toMatch(/if \(type !== att\.document_type\) setDocumentType\.mutate/);
  });

  it("offers the picker only to somebody who may edit the record", () => {
    // Reclassifying a consent form is an edit to the patient record. A nurse
    // or therapist reaching this list from the appointment sheet keeps the
    // read-only badge.
    const page = src();
    expect(page).toMatch(/const canEdit = useCanEdit\("patients"\)/);
    expect(page).toMatch(/\{canEdit \? \(/);
    expect(page).toMatch(/<Badge variant="default" className="text-\[10px\]">\{att\.document_type\}<\/Badge>/);
  });

  it("offers the same five types everywhere", () => {
    // The upload dialog and the card picker must not drift apart.
    expect((src().match(/DOCUMENT_TYPES\.map/g) ?? []).length).toBe(3);
  });

  it("zooms only an image, and only on ctrl or cmd", () => {
    // A bare wheel still scrolls the dialog. Ctrl/Cmd + wheel is also what a
    // trackpad pinch sends - the rule SkinTracker already uses.
    const page = src();
    expect(page).toMatch(/if \(!isImage \|\| !\(e\.ctrlKey \|\| e\.metaKey\)\) return;/);
    expect(page).toMatch(/\{isImage && \(/);
  });

  it("resets to the fit when a different document is opened", () => {
    // 400% carried over from the last page lands nowhere useful on this one.
    const page = src();
    expect(page).toMatch(/useEffect\(\(\) => \{\s*setZoom\(ZOOM_MIN\);\s*setPan\(NO_OFFSET\);\s*\}, \[viewing\?\.id\]\)/);
  });

  it("has controls that say where they are", () => {
    const page = src();
    for (const id of ["zoom-controls", "zoom-in", "zoom-out", "zoom-reset", "zoom-level"]) {
      expect(page, id).toContain(`data-testid="${id}"`);
    }
  });

  it("respects a reduced-motion preference", () => {
    // AGENTS.md: transform and opacity only, with a reduced-motion fallback.
    expect(src()).toMatch(/motion-reduce:transition-none/);
  });
});
