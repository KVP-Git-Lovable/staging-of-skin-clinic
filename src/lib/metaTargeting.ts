/**
 * Ad set targeting helpers shared by the Ad Set form.
 * The edge function (supabase/functions/meta-api/index.ts) carries mirror
 * implementations of the parsing rules so old rows publish consistently.
 */

/* ---------------------------------- ages ---------------------------------- */

export const AGE_MIN_LIMIT = 18;
export const AGE_MAX_LIMIT = 65;
export const AGE_OPTIONS: number[] = Array.from({ length: AGE_MAX_LIMIT - AGE_MIN_LIMIT + 1 }, (_, i) => AGE_MIN_LIMIT + i);

/** Reads a stored age value: "25" | "25-34" (legacy range) | "65+" | number. */
export function parseAgeValue(v: unknown, kind: "min" | "max"): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s === "65+") return 65;
  const range = s.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
  if (range) return kind === "min" ? Number(range[1]) : Number(range[2]);
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** Resolves min/max ages from any stored shape, clamped to Meta's 13–65 and ordered. */
export function ageBounds(minValue: unknown, maxValue: unknown): { min: number; max: number } {
  let min = parseAgeValue(minValue, "min") ?? AGE_MIN_LIMIT;
  let max = parseAgeValue(maxValue, "max") ?? AGE_MAX_LIMIT;
  min = Math.min(Math.max(min, 13), AGE_MAX_LIMIT);
  max = Math.min(Math.max(max, 13), AGE_MAX_LIMIT);
  if (max < min) max = min;
  return { min, max };
}

/* ------------------------------- placements ------------------------------- */

export const PLACEMENT_OPTIONS: Array<[string, string]> = [
  ["FACEBOOK_FEED", "Facebook Feed"],
  ["INSTAGRAM_FEED", "Instagram Feed"],
  ["FACEBOOK_STORIES", "Facebook Stories"],
  ["INSTAGRAM_STORIES", "Instagram Stories"],
  ["REELS", "Reels (Facebook + Instagram)"],
  ["FACEBOOK_MARKETPLACE", "Facebook Marketplace"],
  ["FACEBOOK_VIDEO_FEEDS", "Facebook Video Feeds"],
  ["INSTAGRAM_EXPLORE", "Instagram Explore"],
];
export const PLACEMENT_CODES = new Set(PLACEMENT_OPTIONS.map(([v]) => v));

export type PlacementsState =
  | { mode: "automatic"; confirmed: boolean }
  | { mode: "manual"; codes: string[]; confirmed: boolean };

/**
 * Reads social_ad_sets.placements in every shape it has ever had:
 * - `["FACEBOOK_FEED", …]`         legacy manual list (was never sent to Meta → unconfirmed)
 * - `{ automatic: true }`           imported / automatic (unconfirmed unless stamped)
 * - `{ manual: [...], mode_set_at }` manual, saved by the current form (confirmed)
 * - `{ automatic: true, mode_set_at }` automatic, saved by the current form (confirmed)
 */
export function normalizePlacements(value: unknown): PlacementsState {
  if (Array.isArray(value)) {
    const codes = value.map(String).filter((c) => PLACEMENT_CODES.has(c));
    return codes.length ? { mode: "manual", codes, confirmed: false } : { mode: "automatic", confirmed: false };
  }
  if (value && typeof value === "object") {
    const v = value as { automatic?: unknown; manual?: unknown; mode_set_at?: unknown };
    const confirmed = typeof v.mode_set_at === "string" && v.mode_set_at.length > 0;
    if (Array.isArray(v.manual)) {
      const codes = v.manual.map(String).filter((c) => PLACEMENT_CODES.has(c));
      if (codes.length) return { mode: "manual", codes, confirmed };
    }
    return { mode: "automatic", confirmed };
  }
  return { mode: "automatic", confirmed: false };
}

/** Value written back to social_ad_sets.placements by the form. */
export function serializePlacements(mode: "automatic" | "manual", codes: string[]): unknown {
  const mode_set_at = new Date().toISOString();
  return mode === "manual" ? { manual: codes, mode_set_at } : { automatic: true, mode_set_at };
}

export function describePlacements(value: unknown): string {
  const p = normalizePlacements(value);
  if (p.mode === "automatic") return "Advantage+ placements";
  return `${p.codes.length} placement${p.codes.length === 1 ? "" : "s"}${p.confirmed ? "" : " (not yet applied)"}`;
}

/* ---------------------------------- geo ----------------------------------- */

export type GeoRegion = { key: string; name: string; country?: string };
export type GeoCity = { key: string; name: string; country?: string; region?: string; radius: number; distance_unit: "kilometer" | "mile" };
export type GeoSelection = { countries: string[]; regions: GeoRegion[]; cities: GeoCity[] };

export const EMPTY_GEO: GeoSelection = { countries: [], regions: [], cities: [] };
export const CITY_RADIUS_OPTIONS = [10, 25, 40, 80];

/** Parses the legacy free-text "locations" field: only ISO-2 country codes ever applied. */
export function legacyCountryCodes(locations: unknown): string[] {
  return String(locations ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
}

/** Reads targeting.geo (new) or falls back to codes parsed from the legacy text. */
export function readGeo(targeting: unknown): { geo: GeoSelection; fromLegacy: boolean } {
  const t = (targeting ?? {}) as { geo?: Partial<GeoSelection>; locations?: unknown };
  const g = t.geo;
  if (g && (Array.isArray(g.countries) || Array.isArray(g.regions) || Array.isArray(g.cities))) {
    return {
      geo: {
        countries: Array.isArray(g.countries) ? g.countries.map(String) : [],
        regions: Array.isArray(g.regions) ? (g.regions as GeoRegion[]).filter((r) => r?.key) : [],
        cities: Array.isArray(g.cities)
          ? (g.cities as GeoCity[]).filter((c) => c?.key).map((c) => ({
              ...c,
              radius: Number(c.radius) > 0 ? Number(c.radius) : 25,
              distance_unit: c.distance_unit === "mile" ? "mile" : "kilometer",
            }))
          : [],
      },
      fromLegacy: false,
    };
  }
  return { geo: { countries: legacyCountryCodes(t.locations), regions: [], cities: [] }, fromLegacy: true };
}

export function geoIsEmpty(geo: GeoSelection): boolean {
  return geo.countries.length === 0 && geo.regions.length === 0 && geo.cities.length === 0;
}

const regionNames = (() => {
  try { return new Intl.DisplayNames(["en"], { type: "region" }); } catch { return null; }
})();

export function countryName(code: string): string {
  try { return regionNames?.of(code) || code; } catch { return code; }
}

/** Human-readable summary, also stored in the legacy `locations` field for list views. */
export function describeGeo(geo: GeoSelection): string {
  const parts = [
    ...geo.countries.map((c) => `${c}`),
    ...geo.regions.map((r) => r.name),
    ...geo.cities.map((c) => `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})`),
  ];
  return parts.join(", ");
}

/** ISO 3166-1 alpha-2 codes; India first, then alphabetical by display name. */
const ISO_CODES = ("IN AE AF AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IQ IS IT JM JO JP KE KG KH KI KM KN KP KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW").split(" ");

export const COUNTRY_OPTIONS: Array<{ code: string; name: string }> = (() => {
  const [first, ...rest] = ISO_CODES;
  const sorted = rest.map((code) => ({ code, name: countryName(code) })).sort((a, b) => a.name.localeCompare(b.name));
  return [{ code: first, name: countryName(first) }, ...sorted];
})();
