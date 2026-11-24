import { type KnowledgeArticle } from "@/lib/knowledge";

/**
 * Browsing the knowledge library.
 *
 * The list was four dropdowns over a run of text rows, which answered "show
 * me everything" and nothing else. It is now a labelled filter bar over a
 * grid of cards: the same four questions the clinic actually asks - which
 * service, which kind of article, how far through review, and who it is for -
 * plus a search, a sort and one button that puts it all back.
 *
 * Everything here is the part with no React and no network in it, so the
 * rules can be proved rather than only read.
 */

export interface ArticleFilters {
  service: string;
  category: string;
  status: string;
  audience: string;
  search: string;
  sort: string;
}

export const DEFAULT_FILTERS: ArticleFilters = {
  service: "all",
  category: "all",
  status: "all",
  audience: "all",
  search: "",
  sort: "newest",
};

export const STATUS_OPTIONS = [
  { id: "all", name: "All statuses" },
  { id: "draft", name: "Draft" },
  { id: "reviewed", name: "Reviewed" },
  { id: "published", name: "Published" },
];

/**
 * Who an article is written for.
 *
 * Two axes - an age rule and a gender - in one list, because that is one
 * question to the person browsing: who is this for. The card prints the exact
 * target underneath, so the filter only has to narrow.
 */
export const AUDIENCE_OPTIONS = [
  { id: "all", name: "All audiences" },
  { id: "all_ages", name: "All ages" },
  { id: "age_range", name: "A specific age range" },
  { id: "both", name: "All genders" },
  { id: "female", name: "Women" },
  { id: "male", name: "Men" },
];

type Targeted = Pick<KnowledgeArticle, "gender" | "age_rule">;

export function matchesAudience(article: Targeted, audience: string): boolean {
  switch (audience) {
    case "all_ages":
      return article.age_rule === "all_ages";
    case "age_range":
      return article.age_rule !== "all_ages";
    case "both":
    case "female":
    case "male":
      return article.gender === audience;
    default:
      // Including "all", and anything unrecognised: a filter nobody chose
      // must never hide an article.
      return true;
  }
}

export const SORT_OPTIONS = [
  { id: "newest", name: "Newest First" },
  { id: "oldest", name: "Oldest First" },
  { id: "title", name: "Title A–Z" },
  { id: "reviewed", name: "Recently Reviewed" },
];

/**
 * Which column the database is asked to sort on, and which way.
 *
 * Done in SQL rather than in the browser because the list is paged: sorting
 * the thirty rows already fetched would reorder the page, not the library.
 */
export function sortQuery(sort: string): { column: string; ascending: boolean; nullsFirst?: boolean } {
  switch (sort) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "title":
      return { column: "title", ascending: true };
    case "reviewed":
      // Never reviewed sorts last, not first: "Recently Reviewed" is a
      // question about what HAS been.
      return { column: "reviewed_at", ascending: false, nullsFirst: false };
    default:
      return { column: "updated_at", ascending: false };
  }
}

/** Is anything narrowing the list right now? Drives the Clear Filters button. */
export function activeFilterCount(filters: ArticleFilters): number {
  return (["service", "category", "status", "audience"] as const).filter((k) => filters[k] !== "all").length
    + (filters.search.trim() ? 1 : 0);
}

export function hasActiveFilters(filters: ArticleFilters): boolean {
  return activeFilterCount(filters) > 0;
}

/**
 * Clearing puts the sort back too.
 *
 * "Clear Filters" that leaves the list in Title A-Z is the kind of thing
 * somebody reports as the list being wrong.
 */
export function clearedFilters(): ArticleFilters {
  return { ...DEFAULT_FILTERS };
}

/** Words a person actually reads, across the clinical sections. */
const WORDS_PER_MINUTE = 200;

export function readingMinutes(
  article: Partial<Pick<KnowledgeArticle,
    "summary" | "clinical_protocol" | "contraindications" | "pre_post_care" | "complications_management">>,
): number {
  const text = [
    article.summary,
    article.clinical_protocol,
    article.contraindications,
    article.pre_post_care,
    article.complications_management,
  ].filter(Boolean).join(" ");
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // References are deliberately left out - nobody reads a bibliography - and
  // an empty draft still says "1 min", because "0 min read" reads as broken.
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * The picture on the card, as a path in the private bucket.
 *
 * Only the cover that was deliberately set - uploaded, or generated from the
 * article and kept. It used to fall back to the article's first picture
 * ATTACHMENT, and on the live page that pulled clinical diagrams - skin
 * cross-sections, anatomical drawings - into the card header, which is what
 * the clinic asked to stop. An attachment is a figure inside the article, not
 * a cover for it.
 *
 * Null means the card draws its banner.
 */
export function coverPath(article: Pick<KnowledgeArticle, "cover_image_path">): string | null {
  return (article.cover_image_path ?? "").trim() || null;
}

/**
 * The banner behind a card with no picture, picked from the article's id.
 *
 * Not random: the same article keeps the same banner every time the page is
 * opened, which is what stops the grid shimmering between visits.
 */
export const BANNER_TINTS = [
  "from-primary/25 via-primary/10 to-transparent",
  "from-info/25 via-info/10 to-transparent",
  "from-emerald/25 via-emerald/10 to-transparent",
  "from-gold/30 via-gold/10 to-transparent",
  "from-success/25 via-success/10 to-transparent",
] as const;

export function bannerTint(id: string): string {
  let sum = 0;
  for (const ch of String(id ?? "")) sum += ch.charCodeAt(0);
  return BANNER_TINTS[sum % BANNER_TINTS.length];
}

/** What the count line says above the grid. */
export function resultSummary(count: number, filters: ArticleFilters): string {
  const noun = count === 1 ? "article" : "articles";
  if (!hasActiveFilters(filters)) return `${count} ${noun}`;
  return count === 0 ? "No articles match these filters" : `${count} ${noun} match`;
}

/**
 * What the typed search is turned into before it reaches the database.
 *
 * Two separate hazards, both from text a person typed:
 *   - `%` and `_` are LIKE wildcards, so searching for "50%" without escaping
 *     them matches every article in the library;
 *   - the search spans title and summary, which PostgREST expresses as one
 *     `or=(...)` string, and a comma, bracket or quote inside the value ends
 *     the clause early - at best no results, at worst a filter nobody asked
 *     for.
 *
 * So wildcards are escaped and the grammar characters are dropped. Dropping
 * loses nothing worth having: nobody searches a clinical article for "(".
 */
export function searchPattern(raw: string): string {
  const cleaned = String(raw ?? "").trim().replace(/[(),"]/g, " ").replace(/\s+/g, " ").trim();
  return `%${cleaned.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The or() clause that searches the title and the summary together. */
export function searchOrFilter(raw: string): string {
  const pattern = searchPattern(raw);
  return `title.ilike."${pattern}",summary.ilike."${pattern}"`;
}
