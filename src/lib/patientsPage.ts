import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/supabasePaginate";
import { buildFuzzyOrFilter, buildTokenFilters, fuzzyRank } from "@/lib/fuzzySearch";
import type { Tables } from "@/integrations/supabase/types";

export type Patient = Tables<"patients">;

export const PATIENTS_PAGE_SIZE = 50;

// alternate_phone too: a patient who gave the clinic both an Indian and an
// international number is searched for by whichever one the caller used.
const SEARCH_COLS = ["first_name", "last_name", "email", "phone", "alternate_phone"];

export interface PatientsPage {
  rows: Patient[];
  /** How many patients the active search matches in total, across every page. */
  total: number;
  /** True when a further page of matches exists. */
  hasMore: boolean;
  /**
   * The trimmed search this payload describes.
   *
   * keepPreviousData hands the page the *previous* search's payload while the
   * next one loads, and this is the only way to tell a stale count from a
   * current one - without it the header shows the old number as if it were the
   * answer to what was just typed.
   */
  term: string;
}

/**
 * Just the parts of a Supabase query a search narrowing needs.
 *
 * PostgREST's own builder type is generic over the row shape and does not
 * survive being passed around as a value, so the narrowings are written against
 * this instead - small enough to state, and it keeps `.ilike`/`.or`/`.range`
 * checked rather than waved through as `any`.
 */
interface PatientQuery {
  ilike(column: string, pattern: string): PatientQuery;
  or(filter: string): PatientQuery;
  range(
    from: number,
    to: number
  ): PromiseLike<{ data: unknown[] | null; count: number | null; error: { message: string } | null }>;
}

/**
 * One way of looking for a patient.
 *
 * The same function narrows the page of rows and the count of matches, in the
 * same request, so the two can never end up describing different sets of
 * people.
 */
type Narrow = (q: PatientQuery) => PatientQuery;

/**
 * A page of patients, and how many there are.
 *
 * The count used to be `count: "planned"` - not a count at all, but Postgres's
 * statistical estimate of the table size. It read 32,358 against 27,254 real
 * patients and drifted on its own after every bulk import, while any saved view
 * counted the same people exactly and reported 27,254. The clinic saw the
 * number change by five thousand just for clicking into a view and back.
 *
 * It was asked for on purpose: exact counts over 23k patients combined with
 * leading-wildcard ILIKE were being cancelled by the database. The trigram
 * indexes added since (idx_patients_first_name_raw_trgm and its siblings) took
 * that away - measured on the live data, counting every patient is 8ms and
 * counting a name search is 3ms - so the count is a real count again.
 *
 * It rides on the row request rather than a second one: PostgREST reports the
 * count for the whole filtered set, not just the `.range()`, so one round trip
 * answers both questions from one snapshot.
 */
export async function fetchPatientsPage(page: number, search: string): Promise<PatientsPage> {
  const fromIdx = (page - 1) * PATIENTS_PAGE_SIZE;
  // One row past the page: its presence is how we know a next page exists, from
  // the same snapshot as the rows themselves.
  const toIdx = fromIdx + PATIENTS_PAGE_SIZE;
  const term = search.trim();

  const runPage = async (narrow: Narrow) => {
    const { data, error, count } = await narrow(
      supabase
        .from("patients")
        .select("*", { count: "exact" })
        .order("last_visit_date", { ascending: false, nullsFirst: false }) as unknown as PatientQuery
    ).range(fromIdx, toIdx);
    if (error) throw error;
    const fetched = (data as Patient[]) || [];
    return {
      rows: fetched.slice(0, PATIENTS_PAGE_SIZE),
      total: count ?? fetched.length,
      hasMore: fetched.length > PATIENTS_PAGE_SIZE,
    };
  };

  if (!term) return { ...(await runPage((q) => q)), term };

  const tokens = term.split(/\s+/).filter(Boolean);
  const strategies: Narrow[] = [];

  if (tokens.length >= 2) {
    const [firstName, ...rest] = tokens;
    const lastName = rest.join(" ");
    // Exact match (case-insensitive but whole word), then names that start with
    // what was typed.
    strategies.push((q) => q.ilike("first_name", firstName).ilike("last_name", lastName));
    strategies.push((q) => q.ilike("first_name", `${firstName}%`).ilike("last_name", `${lastName}%`));
  } else {
    const token = tokens[0];
    strategies.push((q) => q.or(`first_name.ilike.${token},last_name.ilike.${token}`));
    // Prefix match. Paged like the others, so a common first name is not capped
    // at a single page of results.
    strategies.push((q) => q.or(`first_name.ilike.${token}%,last_name.ilike.${token}%`));
  }

  // Every word must appear somewhere on the record - separate .or() calls are
  // ANDed by PostgREST - so "nisha rai" no longer returns every Rai. Nothing is
  // lost when a strict match finds nobody: the typo-tolerant fallback below
  // still runs on an empty result.
  strategies.push((q) => {
    for (const f of buildTokenFilters(term, SEARCH_COLS)) q = q.or(f);
    return q;
  });

  for (const narrow of strategies) {
    const result = await runPage(narrow);
    // Chosen on the total, not on whether *this page* happens to hold rows. A
    // search with three exact matches looked empty from page 2 onwards, so the
    // page quietly fell through to the next, wider strategy - page 2 of a
    // search was not page 2 of the same list of people.
    if (result.total > 0) return { ...result, term };
  }

  // Typo-tolerant fallback: nothing matched literally, so pull a loose candidate
  // set (matching the first few letters) and rank it by fuzzy similarity. The
  // ranked set is the whole result here, so its length is the exact total.
  const looseOr = buildFuzzyOrFilter(term, ["first_name", "last_name"]);
  if (looseOr) {
    const { data: loose, error } = await supabase
      .from("patients")
      .select("*")
      .or(looseOr)
      .limit(300);
    if (error) throw error;
    const ranked = fuzzyRank(
      (loose as Patient[]) || [],
      term,
      (p) => `${p.first_name || ""} ${p.last_name || ""} ${p.phone || ""} ${p.email || ""}`,
      0.55
    );
    return {
      rows: ranked.slice(fromIdx, fromIdx + PATIENTS_PAGE_SIZE),
      total: ranked.length,
      hasMore: ranked.length > fromIdx + PATIENTS_PAGE_SIZE,
      term,
    };
  }

  return { rows: [], total: 0, hasMore: false, term };
}

/**
 * Every patient a saved view might match.
 *
 * Saved views filter and count in the browser (`applyFilters` over `viewRows`),
 * so whatever this returns IS the view - anything it does not fetch cannot be
 * matched, and the "N items" count is the count of what it fetched.
 *
 * This used to take `.limit(2000)`. With the list ordered by last visit, that
 * meant every custom view silently saw only the 2,000 most recently seen
 * patients out of ~27,000: a "lifetime value over 2k" view reported 573, having
 * never looked at the other 25,000. A recall or marketing list built from it
 * would have missed most of the clinic's patients without saying so.
 *
 * So it pages through all of them instead, via the helper written for exactly
 * this (`fetchAll` bypasses PostgREST's 1,000-row cap). That is ~27 requests
 * and a few seconds on a cold view; the list already shows a loading state, and
 * a filter that quietly ignores 92% of the patients is the worse trade.
 */
export const fetchAllPatients = async (search: string): Promise<Patient[]> => {
  const term = search.trim();
  return fetchAll<Patient>((from, to) => {
    let q = supabase
      .from("patients")
      .select("*")
      .order("last_visit_date", { ascending: false, nullsFirst: false })
      // last_visit_date is not unique - 8,000 patients share a null alone - and
      // .range() paging over a non-unique order can skip or repeat rows between
      // pages. id breaks the tie so every page is deterministic.
      .order("id", { ascending: true })
      .range(from, to);
    if (term) {
      for (const f of buildTokenFilters(term, ["first_name", "last_name", "email", "phone"])) {
        q = q.or(f);
      }
    }
    return q;
  });
};
