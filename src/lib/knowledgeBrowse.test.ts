import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AUDIENCE_OPTIONS,
  BANNER_TINTS,
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  activeFilterCount,
  bannerTint,
  clearedFilters,
  coverPath,
  hasActiveFilters,
  matchesAudience,
  readingMinutes,
  resultSummary,
  searchOrFilter,
  searchPattern,
  sortQuery,
  type ArticleFilters,
} from "@/lib/knowledgeBrowse";

/**
 * Browsing the knowledge library.
 *
 * Four dropdowns over a run of text rows became a labelled filter bar over a
 * grid of cards. The filtering and sorting still have to happen in the
 * DATABASE, because the list is paged - that is the part worth proving.
 */

const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PAGE = "src/pages/KnowledgeArticles.tsx";
const CARD = "src/components/knowledge/ArticleCard.tsx";

const filters = (over: Partial<ArticleFilters> = {}): ArticleFilters => ({ ...DEFAULT_FILTERS, ...over });

describe("who an article is for", () => {
  const article = (gender: string, age_rule: string) => ({ gender, age_rule });

  it("shows everything when no audience is chosen", () => {
    expect(matchesAudience(article("female", "custom_range"), "all")).toBe(true);
  });

  it("never hides an article for an audience nobody chose", () => {
    // A value the list does not offer must open the library, not empty it.
    expect(matchesAudience(article("male", "all_ages"), "nonsense")).toBe(true);
  });

  it("separates all ages from a specific range", () => {
    expect(matchesAudience(article("both", "all_ages"), "all_ages")).toBe(true);
    expect(matchesAudience(article("both", "custom_range"), "all_ages")).toBe(false);
    expect(matchesAudience(article("both", "custom_range"), "age_range")).toBe(true);
    expect(matchesAudience(article("both", "all_ages"), "age_range")).toBe(false);
  });

  it("narrows by gender", () => {
    expect(matchesAudience(article("female", "all_ages"), "female")).toBe(true);
    expect(matchesAudience(article("both", "all_ages"), "female")).toBe(false);
    expect(matchesAudience(article("both", "all_ages"), "both")).toBe(true);
    expect(matchesAudience(article("male", "all_ages"), "both")).toBe(false);
  });

  it("offers every one of those in the list", () => {
    expect(AUDIENCE_OPTIONS.map((o) => o.id)).toEqual(["all", "all_ages", "age_range", "both", "female", "male"]);
  });
});

describe("the sort the database is asked for", () => {
  it("defaults to the most recently touched", () => {
    expect(sortQuery("newest")).toMatchObject({ column: "updated_at", ascending: false });
    expect(sortQuery("")).toMatchObject({ column: "updated_at", ascending: false });
  });

  it("goes by when it was written, both ways round", () => {
    expect(sortQuery("oldest")).toMatchObject({ column: "created_at", ascending: true });
  });

  it("sorts titles upwards", () => {
    expect(sortQuery("title")).toMatchObject({ column: "title", ascending: true });
  });

  it("puts never-reviewed articles last, not first", () => {
    // "Recently Reviewed" is a question about what HAS been reviewed. A null
    // reviewed_at sorting first would answer the opposite question.
    expect(sortQuery("reviewed")).toEqual({ column: "reviewed_at", ascending: false, nullsFirst: false });
  });

  it("offers each of those in the list", () => {
    expect(SORT_OPTIONS.map((o) => o.id)).toEqual(["newest", "oldest", "title", "reviewed"]);
  });
});

describe("whether anything is narrowing the list", () => {
  it("counts nothing on a fresh page", () => {
    expect(activeFilterCount(filters())).toBe(0);
    expect(hasActiveFilters(filters())).toBe(false);
  });

  it("counts each dropdown that was moved", () => {
    expect(activeFilterCount(filters({ service: "s1", status: "draft" }))).toBe(2);
  });

  it("counts a search, but not a blank one", () => {
    expect(activeFilterCount(filters({ search: "laser" }))).toBe(1);
    expect(activeFilterCount(filters({ search: "   " }))).toBe(0);
  });

  it("does not count the sort, which narrows nothing", () => {
    // Clear Filters would otherwise light up on a page showing everything.
    expect(activeFilterCount(filters({ sort: "title" }))).toBe(0);
  });

  it("puts the sort back as well when cleared", () => {
    // Clearing that leaves the grid in Title A-Z is the kind of thing
    // somebody reports as the list being wrong.
    expect(clearedFilters()).toEqual(DEFAULT_FILTERS);
    expect(clearedFilters().sort).toBe("newest");
  });
});

describe("how long it takes to read", () => {
  it("counts the clinical sections, not the bibliography", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(readingMinutes({ clinical_protocol: words(400) })).toBe(2);
    expect(readingMinutes({ clinical_protocol: words(400), sources: words(4000) } as never)).toBe(2);
  });

  it("adds the sections together", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");
    expect(readingMinutes({ summary: words(100), clinical_protocol: words(300), pre_post_care: words(200) })).toBe(3);
  });

  it("never says nought minutes", () => {
    // "0 min read" on an empty draft reads as broken.
    expect(readingMinutes({})).toBe(1);
    expect(readingMinutes({ summary: "   " })).toBe(1);
    expect(readingMinutes({ summary: "three short words" })).toBe(1);
  });
});

describe("the picture on the card", () => {
  it("uses the cover that was set", () => {
    expect(coverPath({ cover_image_path: "u/g/a.jpg" })).toBe("u/g/a.jpg");
  });

  it("never reaches for a picture ATTACHED to the article", () => {
    // It used to, and on the live page that pulled clinical diagrams - skin
    // cross-sections, anatomical drawings - into the card header. An
    // attachment is a figure inside the article, not a cover for it.
    const withDiagram = {
      cover_image_path: null,
      resources: [{ id: "r0", kind: "image", title: "Cross-section", path: "u/g/diagram.png" }],
    } as never;
    expect(coverPath(withDiagram)).toBe(null);
    expect(code("src/lib/knowledgeBrowse.ts")).not.toContain("articleResources");
  });

  it("ignores a cover that is only whitespace", () => {
    expect(coverPath({ cover_image_path: "   " })).toBe(null);
  });

  it("says there is none, so the card draws its banner", () => {
    expect(coverPath({ cover_image_path: null })).toBe(null);
  });
});

describe("the banner behind a card with no picture", () => {
  it("gives the same article the same banner every time", () => {
    // A grid that shimmers between visits looks broken.
    expect(bannerTint("abc-123")).toBe(bannerTint("abc-123"));
  });

  it("only ever picks one from the list", () => {
    for (const id of ["a", "bb", "ccc", "", "d4-e5-f6", "zzzzzzzz"]) {
      expect(BANNER_TINTS).toContain(bannerTint(id));
    }
  });

  it("uses more than one of them across a library", () => {
    const seen = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(bannerTint));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is built only from semantic colour tokens", () => {
    // The app's polish rule: no raw palette colours in a component.
    for (const tint of BANNER_TINTS) expect(tint).not.toMatch(/-(sky|violet|amber|slate|rose|indigo)-\d{3}/);
  });
});

describe("what the typed search becomes", () => {
  it("escapes the LIKE wildcards", () => {
    // Searching for "50%" without this matches every article in the library.
    expect(searchPattern("50%")).toBe("%50\\%%");
    expect(searchPattern("a_b")).toBe("%a\\_b%");
    expect(searchPattern("back\\slash")).toBe("%back\\\\slash%");
  });

  it("drops the characters that would end the or() clause early", () => {
    // title.ilike."%a,b%" - a comma, bracket or quote inside the value cuts
    // the filter short, at best finding nothing.
    expect(searchPattern('laser, peel (face) "x"')).toBe("%laser peel face x%");
  });

  it("trims and collapses the spaces it leaves behind", () => {
    expect(searchPattern("  laser   peel  ")).toBe("%laser peel%");
  });

  it("searches the title and the summary together", () => {
    expect(searchOrFilter("laser")).toBe('title.ilike."%laser%",summary.ilike."%laser%"');
  });
});

describe("what the count line says", () => {
  it("just counts when nothing is filtered", () => {
    expect(resultSummary(5, filters())).toBe("5 articles");
    expect(resultSummary(1, filters())).toBe("1 article");
  });

  it("says they matched when something is", () => {
    expect(resultSummary(2, filters({ status: "draft" }))).toBe("2 articles match");
    expect(resultSummary(1, filters({ status: "draft" }))).toBe("1 article match");
  });

  it("says so plainly when nothing does", () => {
    expect(resultSummary(0, filters({ search: "zzz" }))).toBe("No articles match these filters");
  });
});

describe("the page asks the database, not the page it already has", () => {
  it("sorts in SQL", () => {
    // The list is paged. Sorting the thirty rows already fetched would
    // reorder the page rather than the library.
    const source = code(PAGE);
    expect(source).toContain("const order = sortQuery(filters.sort)");
    expect(source).toContain("q.order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })");
  });

  it("filters by audience in SQL too", () => {
    const source = code(PAGE);
    expect(source).toContain('q.eq("age_rule", "all_ages")');
    expect(source).toContain('q.neq("age_rule", "all_ages")');
    expect(source).toContain('q.eq("gender", filters.audience)');
  });

  it("sends the search through the escaping helper", () => {
    // Never a raw template string into or(): see searchPattern.
    const source = code(PAGE);
    expect(source).toContain("q.or(searchOrFilter(filters.search))");
    expect(source).not.toMatch(/ilike\(`/);
    expect(source).not.toMatch(/or\(`/);
  });

  it("puts the reader back on the first page whenever a filter moves", () => {
    // Filtering to three articles while still on page 2 shows an empty grid.
    const source = code(PAGE);
    const at = source.indexOf("const set = (patch: Partial<ArticleFilters>)");
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(at, source.indexOf("\n", at))).toContain("setPage(0)");
  });

  it("still redirects the old ?article= links", () => {
    expect(code(PAGE)).toContain('navigate(`/knowledge/${linkedArticle.id}`, { replace: true })');
  });

  it("keeps every action the old list had", () => {
    const source = code(PAGE);
    for (const kept of ["setEditor(a)", "setCloning(a)", "setDeleting(a)", "trash_knowledge_article", "knowledge-ai-paused"]) {
      expect(source).toContain(kept);
    }
  });
});

describe("the card", () => {
  it("signs the cover rather than linking straight at the bucket", () => {
    // Knowledge imagery is clinical and the bucket is private.
    const source = code(CARD);
    expect(source).toContain("createSignedUrl(path, 3600)");
    expect(source).toContain("KNOWLEDGE_BUCKET");
  });

  it("moves only transform and opacity, and stops for reduced motion", () => {
    // Every animated element, not just one of them: this grid can be thirty
    // cards on a clinic laptop, and one unguarded hover is the one that
    // judders.
    const source = code(CARD);
    const classes = [...source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].map((m) => m[1] ?? m[2]);
    const animated = classes.filter((c) => /\btransition-/.test(c));
    expect(animated.length).toBeGreaterThan(1);
    for (const c of animated) expect(c).toContain("motion-reduce:transition-none");
    for (const c of classes.filter((c) => /hover:(-?translate|scale)/.test(c))) {
      expect(c).toContain("motion-reduce:transform-none");
    }
    expect(source).not.toMatch(/transition-\[?(height|width|all)/);
  });

  it("still carries what the old row showed", () => {
    const source = code(CARD);
    for (const kept of ["is_critical", "hasPatientSummary", "EngagementMeter", "targetLabel", "is_active", "ai_generated"]) {
      expect(source).toContain(kept);
    }
  });
});
