import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config";
type ProseCss = { css: unknown };
type ProseTheme = { typography: { DEFAULT: ProseCss; sm: ProseCss; invert?: ProseCss } };

/**
 * `theme.extend.typography.*.css` is CONCATENATED by Tailwind, so the
 * resolved value is an array of style objects, not one object. They have to
 * be merged per selector and in order - a shallow merge would let the last
 * entry mentioning `h2` erase the weight an earlier one set.
 */
function flattenProse(css: unknown): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = value && typeof value === "object" && !Array.isArray(value)
        ? { ...(out[key] ?? {}), ...(value as Record<string, string>) }
        : (value as never);
    }
  };
  visit(css);
  return out;
}
import { ageInYears, matchesDemographics, appendCare, cloneArticle, resourceSchema, suggestedArticleTitle, revisionChanges, sectionStartsCollapsed, splitResources, safeImageSrc, SECTION_FOLD_CHARS, CITATION_LINK_LABEL, citationHost, compactSourceCitations, type KnowledgeArticle } from "./knowledge";
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

/*
 * The real thing, copied out of the live SKIN BOOSTER article
 * (19ab0216-63b6-4b53-97e7-6b70ad351b7f). Every bullet in that article ends
 * this way, which is what the clinic was looking at when they called the
 * page boring.
 */
const LIVE_BULLET =
  "- Active infection, herpes, inflammatory acne or dermatitis in the intended treatment area: defer until controlled.[3,5] ([fda.gov](https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/dermal-fillers-soft-tissue-fillers?utm_source=openai))";

describe("compactSourceCitations", () => {
  it("collapses a real citation from the live article, keeping the href", () => {
    const out = compactSourceCitations(LIVE_BULLET);
    expect(out).toContain(`[${CITATION_LINK_LABEL}](https://www.fda.gov/medical-devices/aesthetic-cosmetic-devices/dermal-fillers-soft-tissue-fillers?utm_source=openai)`);
    // The bracketed hostname is gone, and so are the parens around it.
    expect(out).not.toContain("[fda.gov]");
    expect(out).not.toContain("))");
    // The clinical sentence and its numbered citation are untouched.
    expect(out).toContain("defer until controlled.[3,5]");
  });

  it("matches a bare label against a www. href", () => {
    const out = compactSourceCitations("x ([fda.gov](https://www.fda.gov/a))");
    expect(out).toBe(`x [${CITATION_LINK_LABEL}](https://www.fda.gov/a)`);
  });

  it("matches when the www. is on the label instead of the href", () => {
    // Both sides are normalised, not just the href: an author who wrote the
    // hostname out in full is still writing a bare hostname.
    const out = compactSourceCitations("x ([www.fda.gov](https://fda.gov/a))");
    expect(out).toBe(`x [${CITATION_LINK_LABEL}](https://fda.gov/a)`);
  });

  it("matches when the label carries a trailing slash", () => {
    const out = compactSourceCitations("x ([fda.gov/](https://fda.gov/a))");
    expect(out).toBe(`x [${CITATION_LINK_LABEL}](https://fda.gov/a)`);
  });

  it("leaves a link whose text actually says something", () => {
    const src = "see (the [IADVL guidance](https://ijdvl.com/standard-guidelines/)) for more";
    expect(compactSourceCitations(src)).toBe(src);
  });

  it("leaves a label that carries a path, which is not a bare hostname", () => {
    const src = "x ([fda.gov/medical-devices](https://www.fda.gov/medical-devices))";
    expect(compactSourceCitations(src)).toBe(src);
  });

  it("handles a URL containing balanced parentheses", () => {
    const url = "https://en.wikipedia.org/wiki/Filler_(materials)";
    const out = compactSourceCitations(`x ([en.wikipedia.org](${url}))`);
    expect(out).toBe(`x [${CITATION_LINK_LABEL}](${url})`);
  });

  it("collapses several on one line independently", () => {
    const out = compactSourceCitations("a ([fda.gov](https://fda.gov/x)) b ([ijdvl.com](https://ijdvl.com/y))");
    expect(out).toBe(`a [${CITATION_LINK_LABEL}](https://fda.gov/x) b [${CITATION_LINK_LABEL}](https://ijdvl.com/y)`);
  });

  it("collapses one sitting at the very end of the text", () => {
    const out = compactSourceCitations("tail ([fda.gov](https://fda.gov/x))");
    expect(out.endsWith(`[${CITATION_LINK_LABEL}](https://fda.gov/x)`)).toBe(true);
  });

  it("leaves fenced code alone, because an example of the syntax is not a citation", () => {
    const src = "before ([fda.gov](https://fda.gov/x))\n\n```\n([fda.gov](https://fda.gov/x))\n```\n";
    const out = compactSourceCitations(src);
    expect(out).toContain("```\n([fda.gov](https://fda.gov/x))\n```");
    expect(out).toContain(`before [${CITATION_LINK_LABEL}](https://fda.gov/x)`);
  });

  it("leaves an inline code span alone", () => {
    const src = "write `([fda.gov](https://fda.gov/x))` like this";
    expect(compactSourceCitations(src)).toBe(src);
  });

  it("strips the marker out of stored text, so an article cannot forge one", () => {
    const out = compactSourceCitations(`sneaky ${CITATION_LINK_LABEL} text`);
    expect(out).toBe("sneaky  text");
    expect(out).not.toContain(CITATION_LINK_LABEL);
  });

  it("is safe on empty and null input", () => {
    expect(compactSourceCitations("")).toBe("");
    expect(compactSourceCitations(null)).toBe("");
    expect(compactSourceCitations(undefined)).toBe("");
  });

  it("does not touch a non-http scheme", () => {
    const src = "x ([evil](javascript:alert(1)))";
    expect(compactSourceCitations(src)).toBe(src);
  });
});

describe("citationHost", () => {
  it("drops www. so the label and the href compare equal", () => {
    expect(citationHost("https://www.fda.gov/a")).toBe("fda.gov");
    expect(citationHost("https://pmc.ncbi.nlm.nih.gov/articles/PMC1/")).toBe("pmc.ncbi.nlm.nih.gov");
  });

  it("returns null rather than throwing on junk", () => {
    expect(citationHost("not a url")).toBeNull();
    expect(citationHost(null)).toBeNull();
    expect(citationHost(undefined)).toBeNull();
  });
});

/*
 * The guard for the bug this change fixes.
 *
 * @tailwindcss/typography sat in package.json, unregistered, while
 * ArticleContent.tsx asked for `prose prose-sm`. The classes emitted no CSS
 * and nobody noticed, because nothing fails when a class does nothing: the
 * article just renders as one grey slab. These assertions are what makes
 * that silent again impossible.
 */
describe("the prose styling that renders clinical markdown", () => {
  const content = () => readFileSync("src/components/knowledge/ArticleContent.tsx", "utf8");
  // Comments here explain these very rules, so strip them before asserting
  // or the test passes on its own documentation.
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const prose = () => (resolveConfig(tailwindConfig as never).theme as never as ProseTheme).typography;
  const base = () => flattenProse(prose().DEFAULT.css);
  const small = () => flattenProse(prose().sm.css);

  it("registers the typography plugin, or `prose` silently styles nothing", () => {
    // The whole bug: @tailwindcss/typography sat in package.json, absent
    // from plugins[], while ArticleContent asked for `prose prose-sm`. The
    // classes emitted no CSS and nothing failed - the article just rendered
    // as one grey slab. Resolved here rather than grepped, so a commented
    // out or misspelled registration cannot satisfy it.
    const resolved = prose();
    expect(resolved?.DEFAULT, "typography missing from plugins[]").toBeTruthy();
    expect(resolved?.invert, "plugin did not contribute its own theme").toBeTruthy();
  });

  it("colours every prose variable from a semantic token", () => {
    const css = base() as unknown as Record<string, string>;
    for (const name of ["body", "headings", "lead", "links", "bold", "counters", "bullets", "hr",
      "quotes", "quote-borders", "captions", "code", "pre-code", "pre-bg", "th-borders", "td-borders"]) {
      const value = css[`--tw-prose-${name}`];
      expect(value, `--tw-prose-${name} is not mapped`).toBeTruthy();
      // Dark mode works by redefining these tokens under .dark, so a
      // hardcoded colour is a colour that cannot flip.
      expect(value, `--tw-prose-${name} is not a token`).toMatch(/^hsl\(var\(--[a-z-]+\)\)$/);
    }
  });

  it("uses a link colour that passes AA on the light background", () => {
    // --primary is 174 62% 38%, which measures 3.18:1 there - under the
    // 4.5:1 AA wants for 14px text, in a clinical reference staff read
    // mid-appointment. --accent-foreground is the same teal at 6.36:1.
    expect((base() as unknown as Record<string, string>)["--tw-prose-links"]).toBe("hsl(var(--accent-foreground))");
  });

  it("silences the plugin's literal backtick pseudo-content", () => {
    // styles.js:1538 sets code::before/after to a literal backtick, so
    // `0.05% tretinoin` in an article body would render showing them.
    expect(base()["code::before"]).toEqual({ content: '""' });
    expect(base()["code::after"]).toEqual({ content: '""' });
  });

  it("caps every heading inside a body at the body's own size", () => {
    // The plugin's prose-sm h2 is 1.4285714em = 20px, larger than the
    // section label that owns it. Capped, and ranked by weight instead.
    const sm = small();
    for (const h of ["h1", "h2", "h3", "h4"]) {
      expect(sm[h]?.fontSize, `${h} is not capped at 1em`).toBe("1em");
    }
  });

  it("ranks those headings strictly by weight, down to the body", () => {
    const sm = small();
    const plugin = base();
    // Sizes are capped, so weight is the only thing ranking these.
    const weight = (h: string) => Number(sm[h]?.fontWeight ?? plugin[h]?.fontWeight);
    expect(weight("h1")).toBeGreaterThan(weight("h2"));
    expect(weight("h2")).toBeGreaterThan(weight("h3"));
    expect(weight("h3")).toBeGreaterThan(weight("h4"));
    expect(weight("h4")).toBeGreaterThan(400); // body text
  });

  it("keeps the section label above every heading in the body", () => {
    // 15px clears the 14px cap. Not 16px: in the in-appointment panel this
    // renders inside a <details> whose <summary> is the article's own title
    // at text-sm, and a section must not outrank its own article.
    expect(code(content())).toContain('<h3 className="text-[0.9375rem] font-bold">{label}</h3>');
  });

  it("does not invert prose in dark mode, which would discard the tokens", () => {
    expect(code(content()), "dark:prose-invert is back").not.toContain("dark:prose-invert");
    expect(code(content())).toContain('"prose prose-sm max-w-none text-foreground"');
  });

  it("folds on the transformed text, not the stored body", () => {
    // SECTION_FOLD_CHARS is a proxy for height; collapsing ~70 characters of
    // citation per bullet changes the height materially, so measuring the
    // raw body would fold sections that now fit.
    const body = "- Defer until controlled.[1] ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC10292578/))\n".repeat(6);
    expect(body.length).toBeGreaterThan(SECTION_FOLD_CHARS);
    expect(compactSourceCitations(body).length).toBeLessThan(SECTION_FOLD_CHARS);
    expect(code(content())).toContain("sectionStartsCollapsed(text)");
    expect(code(content())).toContain("compactSourceCitations(body)");
  });
});
