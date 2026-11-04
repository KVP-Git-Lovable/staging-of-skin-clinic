import { describe, it, expect } from "vitest";
import { ageInYears, matchesDemographics, appendCare, cloneArticle, resourceSchema, suggestedArticleTitle, revisionChanges, sectionStartsCollapsed, splitResources, safeImageSrc, SECTION_FOLD_CHARS, type KnowledgeArticle } from "./knowledge";
const range = { gender: "female", age_rule: "custom_range", min_age: 20, max_age: 40 };
describe("service knowledge targeting", () => {
  it("includes both age boundaries", () => {
    expect(matchesDemographics(range, 20, "Female")).toBe(true);
    expect(matchesDemographics(range, 40, "female")).toBe(true);
    expect(matchesDemographics(range, 19, "female")).toBe(false);
    expect(matchesDemographics(range, 41, "female")).toBe(false);
  });
  it("requires the matching gender", () => {
    expect(matchesDemographics(range, 25, "male")).toBe(false);
    expect(matchesDemographics(range, 25, null)).toBe(false);
    expect(matchesDemographics({ ...range, gender: "both" }, 25, "male")).toBe(true);
  });
  it("unknown age matches only all ages", () => {
    expect(matchesDemographics(range, null, "female")).toBe(false);
    expect(matchesDemographics({ ...range, age_rule: "all_ages", gender: "both" }, null, null)).toBe(true);
  });
  it("calculates age at birthday without rounding", () => {
    expect(ageInYears("2006-10-30", new Date(2026, 9, 29))).toBe(19);
    expect(ageInYears("2006-10-29", new Date(2026, 9, 29))).toBe(20);
    expect(ageInYears("2006-02-31")).toBeNull();
  });
  it("keeps existing prescription text when care is explicitly copied", () => {
    expect(appendCare("Existing instructions", "Reviewed care")).toBe("Existing instructions\n\nReviewed care");
  });
});
describe("knowledge resources and management", () => {
  it("permits web and video resources but rejects unsafe protocols", () => {
    expect(resourceSchema.safeParse({ id: "r", kind: "video", title: "Guide", url: "https://example.org/video" }).success).toBe(true);
    expect(resourceSchema.safeParse({ id: "r", kind: "link", title: "Guide", url: "javascript:alert(1)" }).success).toBe(false);
  });
  it("suggests service - age - gender titles", () => {
    expect(suggestedArticleTitle("Skin Biopsy", range)).toBe("Skin Biopsy - 20–40 years - female");
    expect(suggestedArticleTitle("Skin Biopsy", { ...range, age_rule: "all_ages", gender: "both" })).toBe("Skin Biopsy - All ages - All genders");
  });
  it("clones a published article only as an inactive unreviewed draft", () => {
    const clone = cloneArticle({ id: "original", status: "published", is_active: true, reviewed_by: "doctor", revision: 8, title: "Biopsy", resources: [] } as unknown as KnowledgeArticle);
    expect(clone.status).toBe("draft"); expect(clone.is_active).toBe(false);
    expect(clone).not.toHaveProperty("id"); expect(clone).not.toHaveProperty("reviewed_by"); expect(clone).not.toHaveProperty("revision");
  });
  it("tracks before and after values without audit-only noise", () => {
    expect(revisionChanges({ summary: "Old", updated_at: "Yesterday" }, { summary: "New", updated_at: "Today" })).toEqual({ summary: { before: "Old", after: "New" } });
  });
});
/**
 * The clinic's articles average 12,500 characters across five sections and
 * one is 25,000, so long sections open folded behind "Read more". Not one
 * clinical word changes - the text is doctor-approved under a review trigger
 * and rewriting it would need every article re-approved.
 */
describe("sectionStartsCollapsed", () => {
  it("folds a section long enough to be a wall of text", () => {
    expect(sectionStartsCollapsed("x".repeat(SECTION_FOLD_CHARS + 1))).toBe(true);
    expect(sectionStartsCollapsed("x".repeat(4000))).toBe(true);
  });

  it("leaves a short section alone, rather than hiding three lines behind a button", () => {
    expect(sectionStartsCollapsed("Avoid in active infection.")).toBe(false);
    expect(sectionStartsCollapsed("x".repeat(SECTION_FOLD_CHARS))).toBe(false);
  });

  it("measures the text, not the padding around it", () => {
    // A section of blank lines is not long, however many bytes it is.
    expect(sectionStartsCollapsed("   " + " ".repeat(4000))).toBe(false);
    expect(sectionStartsCollapsed("")).toBe(false);
    expect(sectionStartsCollapsed(null)).toBe(false);
    expect(sectionStartsCollapsed(undefined)).toBe(false);
  });
});

/**
 * Pictures used to render in one "Attachments & further reading" list at the
 * very bottom, below the references - so a diagram explaining a step sat past
 * 12,000 characters of prose, where nobody looked.
 */
describe("splitResources", () => {
  const picture = { id: "1", kind: "image", title: "Injection sites", url: "https://x.test/a.png" };
  const pdf = { id: "2", kind: "file", title: "Consent form", path: "a/b/c.pdf" };
  const link = { id: "3", kind: "link", title: "IFU", url: "https://x.test/ifu" };

  it("puts pictures with the content and everything else in further reading", () => {
    const { pictures, others } = splitResources([picture, pdf, link]);
    expect(pictures.map((r) => r.id)).toEqual(["1"]);
    expect(others.map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("loses nothing - every resource lands in exactly one of the two", () => {
    const all = [picture, pdf, link];
    const { pictures, others } = splitResources(all);
    expect(pictures.length + others.length).toBe(all.length);
  });

  it("copes with an article that has no resources at all", () => {
    for (const empty of [null, undefined, [], "not an array", {}]) {
      const { pictures, others } = splitResources(empty);
      expect(pictures).toEqual([]);
      expect(others).toEqual([]);
    }
  });

  it("still drops a resource that does not parse, as articleResources always did", () => {
    const { pictures, others } = splitResources([picture, { id: "4", kind: "nonsense", title: "x" }]);
    expect(pictures).toHaveLength(1);
    expect(others).toHaveLength(0);
  });
});

/**
 * Body images were thrown away wholesale (img: () => null). Rendering them
 * means accepting a src somebody typed into a clinical field, so the guard is
 * the point of the function.
 */
describe("safeImageSrc", () => {
  it("allows a picture served over http(s)", () => {
    expect(safeImageSrc("https://x.test/diagram.png")).toBe("https://x.test/diagram.png");
    expect(safeImageSrc("http://x.test/diagram.png")).toBe("http://x.test/diagram.png");
  });

  it("refuses anything that is not http(s)", () => {
    // javascript: in an img src is the reason this function exists.
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
    expect(safeImageSrc("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    expect(safeImageSrc("vbscript:msgbox(1)")).toBeNull();
    expect(safeImageSrc("file:///etc/passwd")).toBeNull();
  });

  it("renders nothing rather than a broken frame when there is no src", () => {
    expect(safeImageSrc("")).toBeNull();
    expect(safeImageSrc("   ")).toBeNull();
    expect(safeImageSrc(null)).toBeNull();
    expect(safeImageSrc(undefined)).toBeNull();
  });

  it("keeps the src exactly as written, so a signed URL's query survives", () => {
    const signed = "https://x.test/a.png?token=abc&expires=123";
    expect(safeImageSrc(signed)).toBe(signed);
  });
});
