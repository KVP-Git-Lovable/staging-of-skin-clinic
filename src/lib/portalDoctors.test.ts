import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

/**
 * The patient portal's "Our Doctors" section.
 *
 * The list is an inline array in the page's JSX rather than data, so these
 * read the source. They exist for two reasons: the clinic asked for a
 * specific order, and one card deliberately carries less than the others.
 */
const page = () => readFileSync("src/pages/portal/PortalLanding.tsx", "utf8");

/** The doctors block, from the grid down to the `.map(`. */
function doctorsBlock(source: string): string {
  const at = source.indexOf('{[\n              {\n                img: DOCTOR_1');
  expect(at, "the doctors array no longer starts with DOCTOR_1").toBeGreaterThan(-1);
  return source.slice(at, source.indexOf("].map(", at));
}

describe("the portal's doctors", () => {
  it("lists all three", () => {
    const block = doctorsBlock(page());
    for (const name of ["Dr. Vindhya A. Pai", "Dr. Punya Suvarna", "Dr. Ashwini Ashokan"]) {
      expect(block, `${name} is missing`).toContain(name);
    }
  });

  it("keeps the order the clinic asked for", () => {
    // Vindhya, then Punya, then Ashwini. The section used to read Punya
    // first, and the image constants are numbered the other way round
    // (DOCTOR_1 is Vindhya), which is easy to get backwards again.
    const block = doctorsBlock(page());
    const order = ["Dr. Vindhya A. Pai", "Dr. Punya Suvarna", "Dr. Ashwini Ashokan"]
      .map((n) => block.indexOf(n));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it("states no years of experience for Dr. Ashwini", () => {
    // Nothing in this app or on the clinic's own page says how long she has
    // practised. The clinic chose to leave the line off rather than have a
    // figure invented, so her entry must carry no `exp`.
    const block = doctorsBlock(page());
    const hers = block.slice(block.indexOf("Dr. Ashwini Ashokan"));
    expect(hers, "an experience line appeared on Dr. Ashwini's card").not.toMatch(/exp:/);
  });

  it("still states it for the two doctors who have one", () => {
    const block = doctorsBlock(page());
    expect(block).toContain('exp: "14+ Years of Experience"');
    expect(block).toContain('exp: "5+ Years of Experience"');
  });

  it("renders the experience line only when there is one", () => {
    // Without the guard her card would render an empty paragraph.
    expect(page()).toMatch(/\{d\.exp && \(/);
  });

  it("uses the photo that is in the repository, not a guessed CDN url", () => {
    // The other two come from the clinic's CDN; she has no CDN image, and
    // inventing a doctor3.webp url would have shipped a broken picture.
    expect(page()).toContain('import docAshwini from "@/assets/clinic/real/dr-ashwini.jpg"');
    expect(doctorsBlock(page())).toContain("img: docAshwini");
  });
});

/**
 * Every picture these two pages import is really a picture.
 *
 * src/assets/clinic/real/dr-vindhya.jpg is an HTML document saved with a .jpg
 * extension - a page of the clinic's website, not her photograph - so the
 * /clinic page renders a broken image for its founder today. That is
 * pre-existing and is listed below rather than silently tolerated: the test
 * fails if a NEW broken asset appears, and it also fails once a listed one is
 * repaired, which is the nudge to delete it from the list.
 */
const KNOWN_BROKEN: Record<string, string> = {
  "src/assets/clinic/real/dr-vindhya.jpg":
    "saved HTML of the clinic website, not a photograph - /clinic shows a broken image for Dr. Vindhya",
};

function imageImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /^import\s+\w+\s+from\s+"@\/(assets\/[^"]+\.(?:jpe?g|png|webp|gif|svg))";/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(`src/${m[1]}`);
  return out;
}

function looksLikeAnImage(path: string): boolean {
  const b = readFileSync(path);
  if (b.length < 12) return false;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (b[0] === 0x89 && b.subarray(1, 4).toString("latin1") === "PNG") return true; // PNG
  if (b.subarray(0, 3).toString("latin1") === "GIF") return true; // GIF
  if (b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return true;
  const head = b.subarray(0, 400).toString("utf8").trimStart();
  return head.startsWith("<") && head.includes("<svg"); // SVG
}

describe("the landing pages' image assets are images", () => {
  const files = ["src/pages/portal/PortalLanding.tsx", "src/pages/clinic/Landing.tsx"];

  it("finds the imports to check", () => {
    const all = files.flatMap(imageImports);
    expect(all.length, "no @/assets image imports found - has the import style changed?")
      .toBeGreaterThan(3);
  });

  it("every one is a real image, apart from the known-broken", () => {
    const broken: string[] = [];
    for (const asset of new Set(files.flatMap(imageImports))) {
      if (asset in KNOWN_BROKEN) continue;
      if (!looksLikeAnImage(asset)) broken.push(asset);
    }
    expect(broken, `these are imported as images but are not images:\n${broken.join("\n")}`)
      .toEqual([]);
  });

  it("the known-broken list is still accurate", () => {
    for (const [asset, why] of Object.entries(KNOWN_BROKEN)) {
      expect(
        looksLikeAnImage(asset),
        `${asset} is a real image now (${why}) - delete it from KNOWN_BROKEN`,
      ).toBe(false);
    }
  });

  it("Dr. Ashwini's photo in particular is a real JPEG", () => {
    expect(looksLikeAnImage("src/assets/clinic/real/dr-ashwini.jpg")).toBe(true);
  });
});
