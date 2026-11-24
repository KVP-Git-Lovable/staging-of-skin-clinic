import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { SURVEY_ILLUSTRATION_KEYS } from "./surveyIllustration";

/**
 * The photographs above the survey questions.
 *
 * The clinic asked for real pictures rather than line drawings, with one
 * condition: no patient should be able to take offence at them. That part
 * cannot be tested - it was checked by looking at every image - so what is
 * pinned here is everything that CAN go wrong silently: a missing file, a
 * file that is not really an image, one big enough to hurt a phone, and the
 * file extension, which is load-bearing (see below).
 */
const DIR = "src/assets/survey";
const MAX_BYTES = 120 * 1024;

const files = () => (existsSync(DIR) ? readdirSync(DIR) : []);

/** RIFF....WEBP - the same magic-byte check that caught a .jpg which was
 *  really a saved HTML page in src/lib/portalDoctors.test.ts. */
function isWebp(path: string): boolean {
  const b = readFileSync(path);
  if (b.length < 12) return false;
  return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
}

describe("every question key has a picture", () => {
  it("has one file per key", () => {
    const missing = SURVEY_ILLUSTRATION_KEYS.filter((k) => !existsSync(`${DIR}/${k}.webp`));
    expect(missing, `no picture for: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no stray files that match no key", () => {
    // A typo in a filename is otherwise invisible: the key silently falls
    // back to the line drawing and nobody notices the photograph is unused.
    const known = new Set(SURVEY_ILLUSTRATION_KEYS.map((k) => `${k}.webp`));
    const stray = files().filter((f) => !known.has(f));
    expect(stray, `these match no question key: ${stray.join(", ")}`).toEqual([]);
  });
});

describe("the pictures are what they claim to be", () => {
  it("every one is a real WebP", () => {
    const bad = files()
      .map((f) => `${DIR}/${f}`)
      .filter((p) => !isWebp(p));
    expect(bad, `not WebP files:\n${bad.join("\n")}`).toEqual([]);
  });

  it("none is heavy enough to hurt a phone", () => {
    const heavy = files()
      .map((f) => ({ f, kb: Math.round(statSync(`${DIR}/${f}`).size / 1024) }))
      .filter((x) => x.kb * 1024 > MAX_BYTES);
    expect(heavy.map((x) => `${x.f} ${x.kb}KB`), `over ${MAX_BYTES / 1024}KB`).toEqual([]);
  });
});

/**
 * The extension is the mechanism, not a preference.
 */
describe("the pictures stay out of the app's pre-download", () => {
  const vite = () => readFileSync("vite.config.ts", "utf8");

  it("the service worker does not pre-cache webp", () => {
    // vite.config.ts pre-caches a fixed list of extensions. WebP is absent
    // from it, which is the only reason these load on demand instead of
    // being fetched by every patient before the portal opens. Adding webp
    // to globPatterns - or renaming the files to .png - would quietly put
    // about 1.5MB back into that download.
    const glob = vite().match(/globPatterns:\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(glob, "globPatterns not found in vite.config.ts").not.toBe("");
    expect(glob, "webp is now pre-cached, so the pictures load up front").not.toMatch(/webp/);
  });

  it("the pictures are webp, not one of the pre-cached formats", () => {
    const precached = files().filter((f) => /\.(png|svg|ico)$/i.test(f));
    expect(precached, `these would be pre-downloaded by every patient: ${precached.join(", ")}`).toEqual([]);
  });
});

describe("a missing picture is survivable", () => {
  const component = () => readFileSync("src/components/portal/SurveyQuestionImage.tsx", "utf8");

  it("discovers the files instead of importing them statically", () => {
    // A static import of a generated file fails the whole build when the
    // file is not there.
    expect(component()).toContain("import.meta.glob");
  });

  it("falls back to the line drawing, both when absent and when it fails to load", () => {
    const code = component();
    expect(code).toContain("SurveyIllustration");
    expect(code, "no fallback when the key has no file").toMatch(/if \(!src \|\| failed\)/);
    expect(code, "no fallback when the image 404s at runtime").toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
  });

  it("keeps one height whichever branch renders", () => {
    // Otherwise the answer control jumps as the patient steps through.
    const code = component();
    const box = code.match(/const box = `([^`]*)`/)?.[1] ?? "";
    expect(box, "the shared height box is gone").toMatch(/h-32/);
  });

  it("is decorative, so a screen reader reads the question not the picture", () => {
    const code = component();
    expect(code).toMatch(/alt=""/);
    expect(code).toMatch(/aria-hidden="true"/);
    expect(code).toMatch(/loading="lazy"/);
  });
});
