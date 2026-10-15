const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { requireStaffId } from "../_shared/comms-auth.ts";
import { isAdminOrManager, PRIVILEGED_ACTION } from "../_shared/meta-access.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { graph, GRAPH_BASE, INSTAGRAM_PERMISSIONS, resolveInstagramAccount, withInstagramIdentity } from "../_shared/meta-graph.ts";
import { decryptSecret } from "../_shared/meta-crypto.ts";
import {
  buildLeadFormPayload,
  buildLeadObjectStorySpec,
  leadAdSetFields,
  leadPreflightProblem,
  assertUploadableImage,
  pickImageHash,
  validateLeadForm,
  type LeadFormInput,
  leadInsertFromSubmission,
  phoneMatchKey,
} from "../_shared/meta-leadforms.ts";
import { cleanupObject, runCategory, runLifecycle } from "./diagnostics.ts";

const OBJECTIVE_MAP: Record<string, string> = {
  awareness: "OUTCOME_AWARENESS",
  traffic: "OUTCOME_TRAFFIC",
  engagement: "OUTCOME_ENGAGEMENT",
  leads: "OUTCOME_LEADS",
  sales: "OUTCOME_SALES",
  conversions: "OUTCOME_SALES",
  app_promotion: "OUTCOME_APP_PROMOTION",
};

const SPECIAL_CATEGORY_MAP: Record<string, string> = {
  housing: "HOUSING",
  employment: "EMPLOYMENT",
  credit: "CREDIT",
  issues_elections_politics: "ISSUES_ELECTIONS_POLITICS",
  online_gambling_and_gaming: "ONLINE_GAMBLING_AND_GAMING",
  financial_products_services: "FINANCIAL_PRODUCTS_SERVICES",
};
const CAMPAIGN_BID_STRATEGIES = new Set(["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP", "LOWEST_COST_WITH_MIN_ROAS"]);

const BID_STRATEGY_MAP: Record<string, string> = {
  LOWEST_COST: "LOWEST_COST_WITHOUT_CAP",
  LOWEST_COST_WITHOUT_CAP: "LOWEST_COST_WITHOUT_CAP",
  BID_CAP: "LOWEST_COST_WITH_BID_CAP",
  LOWEST_COST_WITH_BID_CAP: "LOWEST_COST_WITH_BID_CAP",
  COST_CAP: "COST_CAP",
  TARGET_COST: "TARGET_COST",
  LOWEST_COST_WITH_MIN_ROAS: "LOWEST_COST_WITH_MIN_ROAS",
};

/** Map a Meta effective/config status onto the local status vocabulary. */
function localStatus(metaStatus?: unknown, fallback = "paused"): string {
  const s = String(metaStatus ?? "").toLowerCase();
  if (["active", "paused", "archived", "deleted"].includes(s)) return s;
  if (s === "campaign_paused" || s === "adset_paused") return "paused";
  return fallback;
}

/** Read a Meta object's current status; never throws. */
async function readMetaStatus(id: string, token: string, fallback = "paused"): Promise<string> {
  try {
    const res = await graph(`/${id}`, { token, params: { fields: "status,effective_status" } });
    return localStatus(res.effective_status || res.status, fallback);
  } catch (_) {
    return fallback;
  }
}

/**
 * Find an already-created Meta child object by exact name under a parent edge.
 * Used to re-link records whose Meta id failed to save, without creating duplicates.
 */
async function findExistingByName(
  edge: string,
  name: string,
  token: string,
): Promise<{ id: string; status?: string } | null> {
  try {
    const res = await graph(edge, {
      token,
      params: { fields: "id,name,status,effective_status", limit: "200" },
    });
    const match = (res?.data || []).find((row: any) => String(row?.name) === name);
    return match ? { id: String(match.id), status: match.effective_status || match.status } : null;
  } catch (_) {
    return null;
  }
}

/** Meta error_subcode for "Start Time Can't Be Edited" on a running ad set. */
const META_SUBCODE_START_TIME_LOCKED = 1487057;

function isStartTimeLockedError(e: unknown): boolean {
  const err = e as Error & { metaSubcode?: unknown };
  if (Number(err?.metaSubcode) === META_SUBCODE_START_TIME_LOCKED) return true;
  return /start time can't be edited/i.test(String(err?.message ?? ""));
}

/**
 * Update an ad set that already exists on Meta.
 *
 * Meta rejects `start_time` once an ad set has started (code 100, subcode
 * 1487057), which used to fail the whole republish. Read the live start time
 * first and drop `start_time` when the schedule has already begun or is
 * unchanged, so budget / bid / end date / targeting edits still reach Meta.
 * If Meta still refuses the start time, retry once without it.
 */
type TargetingAudienceRef = { id?: unknown };

/**
 * Updating `targeting` replaces the whole spec on Meta. When we push an include
 * list, carry over the ad set's live `excluded_custom_audiences` (so exclusions
 * set in Ads Manager survive) minus the audience we are including — Meta rejects
 * an audience that is both included and excluded.
 */
export async function reconcileCustomAudienceExclusions(
  adsetId: string,
  token: string,
  update: Record<string, unknown>,
): Promise<void> {
  const targeting = update.targeting as Record<string, unknown> | undefined;
  const includes = Array.isArray(targeting?.custom_audiences) ? (targeting!.custom_audiences as TargetingAudienceRef[]) : [];
  if (!targeting || includes.length === 0) return;
  const includeIds = new Set(includes.map((a) => String(a?.id ?? "")).filter(Boolean));
  try {
    const live = await graph(`/${adsetId}`, { token, params: { fields: "targeting" } });
    const liveExcluded: TargetingAudienceRef[] = Array.isArray(live?.targeting?.excluded_custom_audiences)
      ? live.targeting.excluded_custom_audiences
      : [];
    const kept = liveExcluded
      .map((a) => String(a?.id ?? ""))
      .filter((id) => id && !includeIds.has(id))
      .map((id) => ({ id }));
    if (liveExcluded.length !== kept.length) {
      console.info("publish_adset: removed included audience from Meta exclusions", JSON.stringify({
        adset_id: adsetId, removed: liveExcluded.length - kept.length,
      }));
    }
    targeting.excluded_custom_audiences = kept;
  } catch (e) {
    console.warn("publish_adset: could not read live targeting for exclusion reconciliation:", (e as Error).message);
  }
}

export async function updateExistingAdSet(
  adsetId: string,
  token: string,
  body: Record<string, unknown>,
  targetingPlan?: TargetingPlan,
): Promise<void> {
  const update: Record<string, unknown> = { ...body };
  delete update.campaign_id;
  delete update.status;

  let liveTargeting: Record<string, unknown> | null = null;
  if (targetingPlan) {
    try {
      const live = await graph(`/${adsetId}`, { token, params: { fields: "targeting" } });
      liveTargeting = (live?.targeting as Record<string, unknown>) ?? null;
    } catch (e) {
      console.warn("publish_adset: could not read live targeting; sending app targeting only:", (e as Error).message);
    }
    update.targeting = liveTargeting
      ? mergeTargeting(liveTargeting, targetingPlan)
      : mergeTargeting({}, targetingPlan);
  } else {
    await reconcileCustomAudienceExclusions(adsetId, token, update);
  }

  if (update.start_time) {
    let keepStartTime = false;
    try {
      const live = await graph(`/${adsetId}`, { token, params: { fields: "start_time" } });
      const liveStart = live?.start_time ? new Date(live.start_time).getTime() : NaN;
      const requested = new Date(String(update.start_time)).getTime();
      // Only send start_time when the ad set has not started yet AND the value
      // actually changed. Anything else is rejected by Meta (subcode 1487057).
      keepStartTime = Number.isFinite(liveStart)
        && liveStart > Date.now()
        && Number.isFinite(requested)
        && liveStart !== requested;
    } catch (e) {
      console.warn("publish_adset: could not read live start_time:", (e as Error).message);
      keepStartTime = false;
    }
    if (!keepStartTime) {
      console.info("publish_adset: keeping Meta start_time", JSON.stringify({ adset_id: adsetId }));
      delete update.start_time;
    }
  }

  try {
    await graph(`/${adsetId}`, { token, method: "POST", body: update });
  } catch (e) {
    if (!isStartTimeLockedError(e)) throw e;
    console.warn("publish_adset: Meta refused start_time edit, retrying without it");
    delete update.start_time;
    await graph(`/${adsetId}`, { token, method: "POST", body: update });
  }
}


/* ------------------------------ ad set targeting ------------------------------ */

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

/** Min/max ages from any stored shape, clamped to Meta's 13–65 and ordered. */
export function resolveAges(t: { age_min?: unknown; age_max?: unknown } | null | undefined): { age_min: number; age_max: number } {
  let min = parseAgeValue(t?.age_min, "min") ?? 18;
  let max = parseAgeValue(t?.age_max, "max") ?? 65;
  min = Math.min(Math.max(min, 13), 65);
  max = Math.min(Math.max(max, 13), 65);
  if (max < min) max = min;
  return { age_min: min, age_max: max };
}

/** Meta genders: [1] men, [2] women, omitted for everyone. */
export function gendersToMeta(genders: unknown): number[] | undefined {
  const list = Array.isArray(genders) ? genders.map(String) : [];
  const men = list.includes("Men");
  const women = list.includes("Women");
  if (men && !women) return [1];
  if (women && !men) return [2];
  return undefined;
}

type PlacementPos = { platform: "facebook" | "instagram"; key: "facebook_positions" | "instagram_positions"; position: string };
const PLACEMENT_META: Record<string, PlacementPos[]> = {
  FACEBOOK_FEED: [{ platform: "facebook", key: "facebook_positions", position: "feed" }],
  INSTAGRAM_FEED: [{ platform: "instagram", key: "instagram_positions", position: "stream" }],
  FACEBOOK_STORIES: [{ platform: "facebook", key: "facebook_positions", position: "story" }],
  INSTAGRAM_STORIES: [{ platform: "instagram", key: "instagram_positions", position: "story" }],
  REELS: [
    { platform: "facebook", key: "facebook_positions", position: "facebook_reels" },
    { platform: "instagram", key: "instagram_positions", position: "reels" },
  ],
  FACEBOOK_MARKETPLACE: [{ platform: "facebook", key: "facebook_positions", position: "marketplace" }],
  FACEBOOK_VIDEO_FEEDS: [{ platform: "facebook", key: "facebook_positions", position: "video_feeds" }],
  INSTAGRAM_EXPLORE: [{ platform: "instagram", key: "instagram_positions", position: "explore" }],
};
const PLACEMENT_TARGETING_KEYS = [
  "publisher_platforms", "facebook_positions", "instagram_positions", "messenger_positions", "audience_network_positions", "threads_positions",
];

export type PlacementPlan = { mode: "automatic" | "manual"; codes: string[]; confirmed: boolean };

/** Reads social_ad_sets.placements in all its historical shapes (see src/lib/metaTargeting.ts). */
export function readPlacements(value: unknown): PlacementPlan {
  const known = (arr: unknown[]) => arr.map(String).filter((c) => c in PLACEMENT_META);
  if (Array.isArray(value)) {
    const codes = known(value);
    return codes.length ? { mode: "manual", codes, confirmed: false } : { mode: "automatic", codes: [], confirmed: false };
  }
  if (value && typeof value === "object") {
    const v = value as { manual?: unknown; mode_set_at?: unknown };
    const confirmed = typeof v.mode_set_at === "string" && v.mode_set_at.length > 0;
    if (Array.isArray(v.manual)) {
      const codes = known(v.manual);
      if (codes.length) return { mode: "manual", codes, confirmed };
    }
    return { mode: "automatic", codes: [], confirmed };
  }
  return { mode: "automatic", codes: [], confirmed: false };
}

/** Manual placement codes → Meta targeting keys (null when nothing recognisable). */
export function placementsToMeta(codes: string[]): Record<string, string[]> | null {
  const platforms = new Set<string>();
  const positions: Record<string, Set<string>> = { facebook_positions: new Set(), instagram_positions: new Set() };
  for (const code of codes) {
    for (const p of PLACEMENT_META[code] || []) {
      platforms.add(p.platform);
      positions[p.key].add(p.position);
    }
  }
  if (!platforms.size) return null;
  const out: Record<string, string[]> = { publisher_platforms: Array.from(platforms) };
  for (const key of Object.keys(positions)) if (positions[key].size) out[key] = Array.from(positions[key]);
  return out;
}

/** Meta targeting → stored placements ({automatic:true} when no platform keys / nothing recognisable). */
export function metaToPlacements(t: Record<string, unknown> | null | undefined): unknown {
  if (!t) return { automatic: true };
  const fb = Array.isArray(t.facebook_positions) ? t.facebook_positions.map(String) : [];
  const ig = Array.isArray(t.instagram_positions) ? t.instagram_positions.map(String) : [];
  if (!Array.isArray(t.publisher_platforms) && !fb.length && !ig.length) return { automatic: true };
  const codes: string[] = [];
  for (const [code, list] of Object.entries(PLACEMENT_META)) {
    const hit = list.some((p) => (p.key === "facebook_positions" ? fb : ig).includes(p.position));
    if (hit) codes.push(code);
  }
  return codes.length ? codes : { automatic: true };
}

type GeoInput = {
  geo?: { countries?: unknown; regions?: Array<{ key?: unknown }>; cities?: Array<{ key?: unknown; radius?: unknown; distance_unit?: unknown }> };
  locations?: unknown;
};

/** geo_locations from targeting.geo (new) or the legacy free text; null when nothing explicit. */
export function geoToMeta(t: GeoInput | null | undefined): Record<string, unknown> | null {
  const g = t?.geo;
  if (g && (Array.isArray(g.countries) || Array.isArray(g.regions) || Array.isArray(g.cities))) {
    const out: Record<string, unknown> = {};
    const countries = Array.isArray(g.countries) ? g.countries.map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)) : [];
    const regions = Array.isArray(g.regions) ? g.regions.filter((r) => r?.key).map((r) => ({ key: String(r.key) })) : [];
    const cities = Array.isArray(g.cities)
      ? g.cities.filter((c) => c?.key).map((c) => ({
          key: String(c.key),
          radius: Number(c.radius) > 0 ? Number(c.radius) : 25,
          distance_unit: c.distance_unit === "mile" ? "mile" : "kilometer",
        }))
      : [];
    if (countries.length) out.countries = countries;
    if (regions.length) out.regions = regions;
    if (cities.length) out.cities = cities;
    return Object.keys(out).length ? out : null;
  }
  const codes = String(t?.locations ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{2}$/.test(s));
  return codes.length ? { countries: codes } : null;
}

const DERIVED_TARGETING_KEYS = ["age_range", "targeting_relaxation_types", "brand_safety_content_filter_levels"];

export type TargetingPlan = {
  /** Fields the app owns; built by publish_adset. */
  app: Record<string, unknown>;
  /** Whether the local row carries an explicit location (else keep Meta's). */
  applyGeo: boolean;
  /** Which placement keys to write; null = leave Meta's placements untouched. */
  placements: "automatic" | "manual" | null;
  /** Whether a customer list is selected (else keep Meta's audiences). */
  applyAudience: boolean;
};

/**
 * Merge the app-managed targeting fields into the ad set's live spec so an
 * update never wipes interests, exclusions, locales or placements that were
 * set in Ads Manager. Meta replaces the whole `targeting` object on update.
 */
export function mergeTargeting(live: Record<string, unknown> | null | undefined, plan: TargetingPlan): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(live || {}) };
  for (const k of DERIVED_TARGETING_KEYS) delete merged[k];
  const app = plan.app;

  merged.age_min = app.age_min;
  merged.age_max = app.age_max;
  if (app.genders) merged.genders = app.genders; else delete merged.genders;

  if (plan.applyGeo && app.geo_locations) merged.geo_locations = app.geo_locations;
  if (!merged.geo_locations) merged.geo_locations = { countries: ["IN"] };

  if (plan.applyAudience) {
    merged.custom_audiences = app.custom_audiences;
    merged.targeting_automation = app.targeting_automation;
    const includeIds = new Set((app.custom_audiences as Array<{ id: string }>).map((a) => String(a.id)));
    const liveExcluded = Array.isArray(merged.excluded_custom_audiences) ? (merged.excluded_custom_audiences as Array<{ id?: unknown }>) : [];
    merged.excluded_custom_audiences = liveExcluded
      .map((a) => String(a?.id ?? ""))
      .filter((id) => id && !includeIds.has(id))
      .map((id) => ({ id }));
  }

  if (plan.placements === "automatic") {
    for (const k of PLACEMENT_TARGETING_KEYS) delete merged[k];
  } else if (plan.placements === "manual") {
    for (const k of PLACEMENT_TARGETING_KEYS) delete merged[k];
    Object.assign(merged, placementsToMeta(app.__placement_codes as string[]) || {});
  }
  delete merged.__placement_codes;
  return merged;
}

/* ------------------------- custom audiences (customer lists) ------------------------- */

/** Meta error_subcode: "Custom Audience Terms Not Accepted" for the ad account. */
const META_SUBCODE_CA_TERMS = 1870090;
/** Rows per POST /{audience}/users call (Meta allows up to 10 000). */
const AUDIENCE_UPLOAD_BATCH = 5000;
const AUDIENCE_MIN_ROWS = 100;
const AUDIENCE_MAX_ROWS = 10000;
const AUDIENCE_DEFAULT_COUNTRY_CODE = "91";
const AUDIENCE_STATUS_FIELDS =
  "approximate_count_lower_bound,approximate_count_upper_bound,delivery_status,operation_status";

function normalizeActId(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
}

function customAudienceTermsUrl(adAccount: string): string {
  return `https://business.facebook.com/ads/manage/customaudiences/tos/?act=${adAccount.replace(/^act_/, "")}`;
}

/** Meta's own payment pages for an ad account (no API exists to add money). */
export function metaBillingUrls(adAccount: string): { recharge_url: string; fallback_url: string } {
  const bare = String(adAccount).replace(/^act_/, "");
  return {
    recharge_url: `https://business.facebook.com/billing_hub/payment_settings?asset_id=${bare}`,
    fallback_url: `https://www.facebook.com/ads/manager/account_settings/account_billing/?act=${bare}`,
  };
}

export const BILLING_FIELDS =
  "name,currency,account_status,disable_reason,is_prepay_account,funding_source,funding_source_details,expired_funding_source_details,amount_spent,balance,spend_cap,business";

type FundingSourceJson = { id?: unknown; type?: unknown; display_string?: unknown; coupon?: unknown } | null | undefined;

function readFundingSource(v: FundingSourceJson) {
  if (!v || typeof v !== "object") return null;
  return {
    id: v.id != null ? String(v.id) : null,
    type: v.type != null && Number.isFinite(Number(v.type)) ? Number(v.type) : null,
    display_string: typeof v.display_string === "string" ? v.display_string : null,
    coupon: v.coupon ?? null,
  };
}

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Normalises Meta's ad-account billing fields for the UI. */
export function readBillingAccount(res: Record<string, unknown>, adAccount: string) {
  return {
    id: adAccount,
    name: typeof res.name === "string" ? res.name : null,
    currency: typeof res.currency === "string" ? res.currency : null,
    account_status: toNumber(res.account_status),
    disable_reason: toNumber(res.disable_reason),
    is_prepay_account: res.is_prepay_account === true,
    amount_spent: toNumber(res.amount_spent),
    balance: toNumber(res.balance),
    spend_cap: toNumber(res.spend_cap),
    funding_source: readFundingSource(res.funding_source_details as FundingSourceJson),
    expired_funding_source: readFundingSource(res.expired_funding_source_details as FundingSourceJson),
    business_name: (res.business as { name?: string } | undefined)?.name ?? null,
    checked_at: new Date().toISOString(),
  };
}

function isCustomAudienceTermsError(e: unknown): boolean {
  const err = e as Error & { metaSubcode?: unknown };
  if (Number(err?.metaSubcode) === META_SUBCODE_CA_TERMS) return true;
  return /custom audience terms/i.test(String(err?.message ?? ""));
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Meta rule for EMAIL: trim + lowercase. Null when not an email. */
export function normalizeAudienceEmail(v: unknown): string | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

/** Meta rule for PHONE: digits only, no leading zeros, country code included (10 digits => India). */
export function normalizeAudiencePhone(v: unknown, defaultCountryCode = AUDIENCE_DEFAULT_COUNTRY_CODE): string | null {
  let digits = String(v ?? "").trim().replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return null;
  if (digits.length === 10) digits = `${defaultCountryCode}${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export type AudienceHashedRow = [string, string]; // [EMAIL hash | "", PHONE hash | ""]

/**
 * Normalise, dedupe and SHA-256 the identifiers of a customer list.
 * Returns the hashed rows plus how many inputs were unusable or duplicated.
 */
export async function prepareAudienceRows(
  rows: Array<{ email?: unknown; phone?: unknown }>,
): Promise<{ data: AudienceHashedRow[]; invalid: number; duplicates: number }> {
  const seen = new Set<string>();
  const data: AudienceHashedRow[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of rows) {
    const email = normalizeAudienceEmail(r?.email);
    const phone = normalizeAudiencePhone(r?.phone);
    if (!email && !phone) { invalid++; continue; }
    const key = `${email ?? ""}|${phone ?? ""}`;
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    data.push([email ? await sha256Hex(email) : "", phone ? await sha256Hex(phone) : ""]);
  }
  return { data, invalid, duplicates };
}

/**
 * Upload hashed rows to a Meta custom audience in batches, all under one session
 * so Meta treats them as a single import.
 */
export async function uploadAudienceRows(
  audienceId: string,
  token: string,
  data: AudienceHashedRow[],
  stepFn: <T>(label: string, fn: () => Promise<T>) => Promise<T>,
): Promise<number> {
  const sessionId = Date.now() * 1000 + Math.floor(Math.random() * 1000); // < 2^53, unique enough per account
  const batches = Math.max(1, Math.ceil(data.length / AUDIENCE_UPLOAD_BATCH));
  let received = 0;
  for (let i = 0; i < batches; i++) {
    const chunk = data.slice(i * AUDIENCE_UPLOAD_BATCH, (i + 1) * AUDIENCE_UPLOAD_BATCH);
    const res = await stepFn(`Upload customer list batch ${i + 1} of ${batches}`, () =>
      graph(`/${audienceId}/users`, {
        token,
        method: "POST",
        body: {
          session: {
            session_id: sessionId,
            batch_seq: i + 1,
            last_batch_flag: i === batches - 1,
            estimated_num_total: data.length,
          },
          payload: { schema: ["EMAIL", "PHONE"], data: chunk },
        },
      }));
    received += Number(res?.num_received ?? chunk.length);
  }
  return received;
}

async function readAudienceStatus(audienceId: string, token: string): Promise<Record<string, unknown>> {
  try {
    const res = await graph(`/${audienceId}`, { token, params: { fields: AUDIENCE_STATUS_FIELDS } });
    return {
      approximate_count_lower_bound: res?.approximate_count_lower_bound ?? null,
      approximate_count_upper_bound: res?.approximate_count_upper_bound ?? null,
      delivery_status: res?.delivery_status ?? null,
      operation_status: res?.operation_status ?? null,
      checked_at: new Date().toISOString(),
    };
  } catch (e) {
    return { error: (e as Error).message, checked_at: new Date().toISOString() };
  }
}

/* ------------------------------ ad creatives ------------------------------ */

type AdMediaJson = {
  kind?: string; url?: string; video_id?: string; video_status?: string; thumbnail_url?: string;
};

/** Reads social_ads.media; legacy rows hold { url } and are treated as images. */
export function readAdMedia(value: unknown): AdMediaJson | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const url = typeof v.url === "string" ? v.url.trim() : "";
  if (!url) return null;
  return {
    kind: v.kind === "video" ? "video" : "image",
    url,
    video_id: typeof v.video_id === "string" ? v.video_id : undefined,
    video_status: typeof v.video_status === "string" ? v.video_status : undefined,
    thumbnail_url: typeof v.thumbnail_url === "string" ? v.thumbnail_url : undefined,
  };
}

/**
 * Uploads the ad's image to the ad account's image library and caches the returned hash on
 * social_ads.media.image_hash. Per Meta's Ad Images reference the only upload modes are
 * `bytes` (base64) or `copy_from`; a URL is not accepted (Meta answers error code 3), so the
 * image is downloaded from its public bucket URL and sent as bytes. Lead ad creatives
 * reference images by hash, as in Meta's lead-ads guide.
 */
// deno-lint-ignore no-explicit-any
async function ensureImageHash(ad: Record<string, unknown>, adAccount: string, token: string, db: any): Promise<string> {
  const media = (ad.media && typeof ad.media === "object" ? ad.media : {}) as Record<string, unknown>;
  const cachedHash = typeof media.image_hash === "string" ? media.image_hash : "";
  const cachedFor = typeof media.image_hash_url === "string" ? media.image_hash_url : "";
  const url = typeof media.url === "string" ? media.url.trim() : "";
  if (!url) throw new Error("Lead ads need an image or a video.");
  if (cachedHash && cachedFor === url) return cachedHash;

  // 1. Download the image the uploader stored in the public bucket.
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error(`Could not download the ad image (${imgRes.status}). Re-upload the image on the ad.`);
  const buf = new Uint8Array(await imgRes.arrayBuffer());
  assertUploadableImage(imgRes.headers.get("content-type"), buf.byteLength);
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const bytes = btoa(binary);

  // 2. POST /act_{id}/adimages with `bytes` (form-encoded, as in Meta's examples).
  const acct = adAccount.startsWith("act_") ? adAccount : `act_${adAccount}`;
  const form = new URLSearchParams({ bytes, access_token: token });
  const res = await fetch(`${GRAPH_BASE}/${acct}/adimages`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.error) {
    const e = json?.error || {};
    throw new Error(`[Meta ${res.status}] ${e.message || text}${e.code != null ? ` (code ${e.code}${e.error_subcode != null ? `, subcode ${e.error_subcode}` : ""})` : ""}`);
  }
  const hash = pickImageHash(json);
  if (!hash) throw new Error("Meta did not return an image hash for the ad image.");
  await db.from("social_ads").update({ media: { ...media, image_hash: hash, image_hash_url: url } }).eq("id", ad.id);
  return hash;
}

/** Meta's processing state for an ad-account video (`status.video_status`). */
export function videoStatusFromMeta(res: unknown): "processing" | "ready" | "error" {
  const status = (res as { status?: { video_status?: string } })?.status?.video_status;
  if (status === "ready") return "ready";
  if (status === "error" || status === "expired") return "error";
  return "processing";
}

export type AdCreativeSource = {
  name: string;
  primary_text?: string | null;
  headline?: string | null;
  description?: string | null;
  destination_url?: string | null;
  destination_enabled?: boolean | null;
  call_to_action?: string | null;
  format?: string | null;
  multi_advertiser?: boolean | null;
  media?: unknown;
};

/**
 * Builds the `object_story_spec` for an ad from its saved fields.
 * - image (or legacy image URL) + destination  -> link_data (unchanged behaviour)
 * - image, no destination                      -> photo_data
 * - video + destination                        -> video_data with CTA
 * - video, no destination                      -> video_data without CTA / link description
 * Throws a plain Error with a user-facing message when the ad cannot be built.
 */
export function buildObjectStorySpec(ad: AdCreativeSource, pageId: string): Record<string, unknown> {
  if (ad.format === "carousel") {
    throw new Error("Carousel ads are not supported yet. Choose the single image or video format.");
  }
  const media = readAdMedia(ad.media);
  const destinationOn = ad.destination_enabled !== false;
  const link = String(ad.destination_url ?? "").trim();
  if (destinationOn && !link) throw new Error("Destination URL is required");
  const cta = ad.call_to_action && ad.call_to_action !== "NO_BUTTON"
    ? { type: ad.call_to_action, value: { link } }
    : null;

  if (media?.kind === "video") {
    if (!media.video_id) {
      throw new Error("The video has not been registered on Meta yet. Open the ad, wait for the video to show Ready, then publish.");
    }
    if (media.video_status !== "ready") {
      throw new Error("The video is still processing on Meta. Try again in a minute (use \"Check status\" on the ad).");
    }
    const videoData: Record<string, unknown> = {
      video_id: media.video_id,
      title: ad.headline || ad.name,
      message: ad.primary_text || "",
    };
    if (media.thumbnail_url) videoData.image_url = media.thumbnail_url;
    if (destinationOn) {
      if (ad.description) videoData.link_description = ad.description;
      if (cta) videoData.call_to_action = cta;
    }
    return { page_id: pageId, video_data: videoData };
  }

  if (!destinationOn) {
    if (!media?.url) throw new Error("Add an image or a video, or turn on \"Add a destination\" and enter a URL.");
    return { page_id: pageId, photo_data: { url: media.url, caption: ad.primary_text || "" } };
  }

  const linkData: Record<string, unknown> = {
    link,
    message: ad.primary_text || "",
    name: ad.headline || ad.name,
    description: ad.description || "",
  };
  if (media?.url) linkData.picture = media.url;
  if (cta) linkData.call_to_action = cta;
  return { page_id: pageId, link_data: linkData };
}

export function multiAdvertiserSpec(ad: AdCreativeSource): { enroll_status: "OPT_IN" | "OPT_OUT" } {
  return { enroll_status: ad.multi_advertiser === false ? "OPT_OUT" : "OPT_IN" };
}

const sameInstant = (a: unknown, b: unknown) => {
  const ta = a ? new Date(String(a)).getTime() : NaN;
  const tb = b ? new Date(String(b)).getTime() : NaN;
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
};

/**
 * Fields to POST to an existing campaign: only what differs from Meta.
 * Objective, buying_type and status are never sent here (status is owned by
 * Pause / Resume; the other two cannot change after creation).
 */
export function buildCampaignUpdate(live: Record<string, unknown>, desired: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (desired.name && desired.name !== live.name) out.name = desired.name;
  const liveSpecial = Array.isArray(live.special_ad_categories) ? [...(live.special_ad_categories as string[])].sort() : [];
  const wantSpecial = Array.isArray(desired.special_ad_categories) ? [...(desired.special_ad_categories as string[])].sort() : [];
  const normalize = (arr: string[]) => arr.filter((x) => x !== "NONE").join(",");
  if (normalize(liveSpecial) !== normalize(wantSpecial)) out.special_ad_categories = desired.special_ad_categories;
  if (desired.daily_budget !== undefined && Number(live.daily_budget ?? 0) !== Number(desired.daily_budget)) out.daily_budget = desired.daily_budget;
  if (desired.lifetime_budget !== undefined && Number(live.lifetime_budget ?? 0) !== Number(desired.lifetime_budget)) out.lifetime_budget = desired.lifetime_budget;
  if (desired.start_time && !sameInstant(live.start_time, desired.start_time)) out.start_time = desired.start_time;
  if (desired.stop_time && !sameInstant(live.stop_time, desired.stop_time)) out.stop_time = desired.stop_time;
  if (desired.bid_strategy !== undefined && desired.bid_strategy !== live.bid_strategy) out.bid_strategy = desired.bid_strategy;
  if (desired.spend_cap !== undefined && Number(live.spend_cap ?? 0) !== Number(desired.spend_cap)) out.spend_cap = desired.spend_cap;
  const liveCountries = Array.isArray(live.special_ad_category_country) ? [...(live.special_ad_category_country as string[])].sort().join(",") : "";
  const wantCountries = Array.isArray(desired.special_ad_category_country) ? [...(desired.special_ad_category_country as string[])].sort().join(",") : "";
  if (desired.special_ad_category_country !== undefined && liveCountries !== wantCountries) out.special_ad_category_country = desired.special_ad_category_country;
  return out;
}

/** Read every page of a Meta edge, following the cursor until it runs out. */
async function graphAll(edge: string, token: string, fields: string, pageLimit = 25): Promise<any[]> {
  const out: any[] = [];
  let after: string | undefined;
  for (let page = 0; page < pageLimit; page++) {
    const params: Record<string, string> = { fields, limit: "100" };
    if (after) params.after = after;
    const res = await graph(edge, { token, params });
    out.push(...(res?.data || []));
    after = res?.paging?.cursors?.after;
    if (!res?.paging?.next || !after) break;
  }
  return out;
}

const OBJECTIVE_REVERSE: Record<string, string> = {
  OUTCOME_AWARENESS: "awareness",
  OUTCOME_TRAFFIC: "traffic",
  OUTCOME_ENGAGEMENT: "engagement",
  OUTCOME_LEADS: "leads",
  OUTCOME_SALES: "sales",
  OUTCOME_APP_PROMOTION: "app_promotion",
  BRAND_AWARENESS: "awareness",
  REACH: "awareness",
  LINK_CLICKS: "traffic",
  POST_ENGAGEMENT: "engagement",
  PAGE_LIKES: "engagement",
  LEAD_GENERATION: "leads",
  CONVERSIONS: "conversions",
  PRODUCT_CATALOG_SALES: "sales",
  APP_INSTALLS: "app_promotion",
};

function reverseObjective(v: unknown): string {
  return OBJECTIVE_REVERSE[String(v ?? "").toUpperCase()] || "traffic";
}

function reverseSpecialCategory(v: unknown): string | null {
  const s = String(v ?? "").toUpperCase();
  const local = Object.entries(SPECIAL_CATEGORY_MAP).find(([, meta]) => meta === s)?.[0];
  return local || null;
}

/** Convert Meta's minor-unit budgets to the local rupee columns. */
function moneyToLocal(daily: unknown, lifetime: unknown, nullable = false) {
  if (daily) return { budget_type: "daily", budget_amount: Number(daily) / 100 };
  if (lifetime) return { budget_type: "lifetime", budget_amount: Number(lifetime) / 100 };
  return { budget_type: "daily", budget_amount: nullable ? null : 0 };
}

/** Reduce Meta targeting to the shape the Ad Set form understands. */
function readTargeting(t: any): Record<string, unknown> {
  const genderMap: Record<number, string> = { 1: "Men", 2: "Women" };
  const geoLive = t?.geo_locations || {};
  const countries: string[] = Array.isArray(geoLive.countries) ? geoLive.countries.map(String) : [];
  const regions = Array.isArray(geoLive.regions)
    ? geoLive.regions.filter((r: any) => r?.key).map((r: any) => ({ key: String(r.key), name: String(r.name ?? r.key), country: r.country ? String(r.country) : undefined }))
    : [];
  const cities = Array.isArray(geoLive.cities)
    ? geoLive.cities.filter((c: any) => c?.key).map((c: any) => ({
        key: String(c.key), name: String(c.name ?? c.key), country: c.country ? String(c.country) : undefined,
        region: c.region ? String(c.region) : undefined,
        radius: Number(c.radius) > 0 ? Number(c.radius) : 25,
        distance_unit: c.distance_unit === "mile" ? "mile" : "kilometer",
      }))
    : [];
  const summary = [
    ...countries,
    ...regions.map((r: { name: string }) => r.name),
    ...cities.map((c: { name: string; radius: number; distance_unit: string }) => `${c.name} (+${c.radius} ${c.distance_unit === "mile" ? "mi" : "km"})`),
  ].join(", ");
  return {
    age_min: t?.age_min ? String(t.age_min) : "18",
    age_max: t?.age_max ? String(t.age_max) : "65",
    // [] means everyone (the form's convention); Meta uses 1 = men, 2 = women.
    genders: Array.isArray(t?.genders) && t.genders.length
      ? t.genders.map((g: number) => genderMap[g]).filter(Boolean)
      : [],
    locations: summary,
    geo: { countries, regions, cities },
  };
}

/** Meta refused because of missing permissions / Lead Ads Terms (not a real failure of our request). */
function isLeadAccessBlocked(e: unknown): boolean {
  const err = e as { metaCode?: unknown; httpStatus?: number; message?: string };
  const code = Number(err?.metaCode);
  return code === 200 || code === 10 || err?.httpStatus === 403 || /permission|terms|tos/i.test(String(err?.message || ""));
}

/**
 * Send forms saved as PENDING_META to Meta. Ads that pointed at "pending:<row id>" are moved to
 * the real Meta form id. Returns how many were sent; stops quietly while Meta still blocks access.
 */
async function pushPendingLeadForms(db: any, pageId: string, token: string): Promise<{ pushed: number; blocked: string | null }> {
  const { data: pending } = await db.from("social_lead_forms").select("*").eq("page_id", pageId).eq("status", "PENDING_META");
  let pushed = 0;
  for (const row of pending || []) {
    if (!row.draft_payload) continue;
    try {
      const created = await graph(`/${pageId}/leadgen_forms`, { token, method: "POST", body: row.draft_payload });
      const externalId = String(created.id);
      await db.from("social_lead_forms").update({ external_id: externalId, status: "ACTIVE" }).eq("id", row.id);
      await db.from("social_ads").update({ lead_form_id: externalId }).eq("lead_form_id", `pending:${row.id}`);
      pushed++;
    } catch (e) {
      if (isLeadAccessBlocked(e)) return { pushed, blocked: (e as Error).message };
      throw e;
    }
  }
  return { pushed, blocked: null };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Ad account used to build help links in the error handler (set once the connection loads).
  let errorAdAccount = "";

  try {
    // Staff only: patient-portal logins also hold valid JWTs and must not reach Meta.
    const auth = await requireStaffId(req);
    if (auth instanceof Response) return auth;
    const authUserId = auth.staffId;

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { action, payload = {} } = await req.json();
    if (!action) return json({ error: "action is required" }, 400);

    // Anything that publishes, spends, deletes or changes the live Meta account needs an admin or manager.
    if (PRIVILEGED_ACTION.test(String(action)) && !(await isAdminOrManager(auth.staffId))) {
      return json({ error: "Only an admin or manager can do this" }, 403);
    }

    const { data: conn, error: connectionError } = await db
      .from("social_connections")
      .select("*")
      .eq("platform", "meta")
      .maybeSingle();
    if (connectionError) throw new Error(connectionError.message);
    // Disconnection is an expected domain state, including when a connection is
    // removed between the UI loading it and a subsequent request. Callers already
    // handle { error } responses without throwing a FunctionsHttpError.
    if (!conn) return json({ error: "No Meta account is connected", code: "meta_not_connected" });
    errorAdAccount = normalizeActId(conn.default_ad_account_id);

    // Handled before the token is decrypted so a connection can always be removed,
    // even after META_TOKEN_ENC_KEY was changed. Pages and ad accounts cascade; campaigns,
    // ads and saved leads stay as local records.
    if (action === "disconnect") {
      const { error: delErr } = await db.from("social_connections").delete().eq("id", conn.id);
      if (delErr) throw new Error(delErr.message);
      return json({ success: true });
    }
    const userToken = await decryptSecret(conn.access_token_enc);

    const pageToken = async (pageId: string) => {
      const { data: page } = await db
        .from("social_pages")
        .select("page_token_enc")
        .eq("connection_id", conn.id)
        .eq("page_id", pageId)
        .maybeSingle();
      if (!page?.page_token_enc) throw new Error("Page access token is unavailable — reconnect Meta");
      return await decryptSecret(page.page_token_enc);
    };

    /**
     * Run one Meta call and label it, so a failure says which step broke
     * (building the creative vs. creating the ad) instead of one merged error.
     */
    const step = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      try {
        return await fn();
      } catch (e) {
        const err = e as Error & { metaStep?: string };
        err.metaStep = label;
        err.message = `${label} failed: ${err.message}`;
        throw err;
      }
    };


    switch (action) {
      /* ------------------------------ campaigns ----------------------------- */
      case "publish_campaign": {
        const { data: c } = await db.from("social_campaigns").select("*").eq("id", payload.campaign_id).maybeSingle();
        if (!c) throw new Error("Campaign not found");
        const adAccount = c.ad_account_id || conn.default_ad_account_id;
        if (!adAccount) throw new Error("Select a default Ad Account first");

        const specials = (c.special_ad_categories || [])
          .map((s: string) => SPECIAL_CATEGORY_MAP[s])
          .filter(Boolean);

        const metaObjective = OBJECTIVE_MAP[c.objective];
        if (!metaObjective) {
          return json({ error: `Objective "${c.objective}" is not supported. Edit the campaign and choose one of the listed objectives.` }, 400);
        }
        if (c.buying_type === "reach_and_frequency") {
          return json({ error: "Reach & Frequency (RESERVED) campaigns need a reservation that this app does not create yet. Use Auction." }, 400);
        }
        const body: Record<string, unknown> = {
          name: c.name,
          objective: metaObjective,
          status: c.status === "active" ? "ACTIVE" : "PAUSED",
          buying_type: "AUCTION",
          special_ad_categories: specials.length ? specials : ["NONE"],
        };
        if (specials.length && Array.isArray(c.special_ad_category_country) && c.special_ad_category_country.length) {
          body.special_ad_category_country = c.special_ad_category_country.map((x: string) => String(x).toUpperCase());
        }
        // A blank / zero budget means the ad sets carry their own budgets.
        const campaignBudgetMinor = Number(c.budget_amount) > 0 ? Math.round(Number(c.budget_amount) * 100) : 0;
        if (campaignBudgetMinor > 0) {
          if (c.budget_type === "daily") body.daily_budget = campaignBudgetMinor;
          else {
            if (!c.end_date) return json({ error: "A lifetime budget needs an End Date. Edit the campaign and set one, or switch to a daily budget." }, 400);
            body.lifetime_budget = campaignBudgetMinor;
          }
          // With a campaign budget the bid strategy belongs to the campaign (Meta reference).
          body.bid_strategy = CAMPAIGN_BID_STRATEGIES.has(String(c.bid_strategy)) ? String(c.bid_strategy) : "LOWEST_COST_WITHOUT_CAP";
        }
        if (Number(c.spend_cap) > 0) body.spend_cap = Math.round(Number(c.spend_cap) * 100);
        if (c.start_date) body.start_time = c.start_date;
        if (c.end_date) body.stop_time = c.end_date;

        const acct = String(adAccount).startsWith("act_") ? adAccount : `act_${adAccount}`;

        let created: { id: string };
        if (c.external_id) {
          // Already on Meta: update in place (never create a duplicate).
          const live = await step("Read campaign on Meta", () => graph(`/${c.external_id}`, {
            token: userToken,
            params: { fields: "id,name,objective,buying_type,daily_budget,lifetime_budget,bid_strategy,spend_cap,special_ad_categories,special_ad_category_country,start_time,stop_time" },
          }));
          if (live.objective && live.objective !== body.objective) {
            return json({
              error: `Meta does not allow changing a campaign's objective after it is created (Meta has ${live.objective}). Create a new campaign for a different objective.`,
            }, 400);
          }
          if (live.buying_type && live.buying_type !== body.buying_type) {
            return json({ error: "Meta does not allow changing the buying type of an existing campaign. Create a new campaign instead." }, 400);
          }
          const updateBody = buildCampaignUpdate(live, body);
          if (Object.keys(updateBody).length) {
            await step("Update campaign on Meta", () => graph(`/${c.external_id}`, { token: userToken, method: "POST", body: updateBody }));
          }
          created = { id: String(c.external_id) };
        } else {
          // Re-link instead of duplicating when a previous publish created the
          // campaign on Meta but failed to save its id locally.
          const existingCampaign = await findExistingByName(`/${acct}/campaigns`, c.name, userToken);
          created = existingCampaign
            ? existingCampaign
            : await graph(`/${acct}/campaigns`, { token: userToken, method: "POST", body });
        }

        const publishedAt = new Date().toISOString();
        const campaignStatus = await readMetaStatus(created.id, userToken, c.status === "active" ? "active" : "paused");
        const { error: campaignSaveError } = await db.from("social_campaigns").update({
          external_id: created.id,
          published_at: publishedAt,
          status: campaignStatus,
          last_synced_at: publishedAt,
        }).eq("id", c.id);
        if (campaignSaveError) {
          throw new Error(
            `Campaign was created on Meta (id ${created.id}) but saving it here failed: ${campaignSaveError.message}`,
          );
        }
        return json({ success: true, campaign_id: created.id, published_at: publishedAt, status: campaignStatus });
      }

      case "pause_campaign":
      case "resume_campaign": {
        const { data: c } = await db.from("social_campaigns").select("*").eq("id", payload.campaign_id).maybeSingle();
        if (!c) throw new Error("Campaign not found");
        const next = action === "pause_campaign" ? "PAUSED" : "ACTIVE";
        if (c.external_id) await graph(`/${c.external_id}`, { token: userToken, method: "POST", body: { status: next } });
        await db.from("social_campaigns").update({ status: next.toLowerCase() }).eq("id", c.id);
        return json({ success: true, status: next.toLowerCase() });
      }

      case "delete_campaign": {
        const { data: c } = await db.from("social_campaigns").select("*").eq("id", payload.campaign_id).maybeSingle();
        if (c?.external_id && !payload.local_only) {
          try {
            await graph(`/${c.external_id}`, { token: userToken, method: "DELETE" });
          } catch (e) {
            // Keep the local row so the campaign is not orphaned on Meta; the UI offers "delete locally only".
            const msg = (e as Error).message;
            console.error("Meta delete failed; keeping local row:", msg);
            return json({ error: `Meta refused to delete this campaign: ${msg}`, code: "meta_delete_failed" }, 400);
          }
        }
        await db.from("social_campaigns").delete().eq("id", payload.campaign_id);
        return json({ success: true });
      }
      case "archive_campaign": {
        const { data: c } = await db.from("social_campaigns").select("*").eq("id", payload.campaign_id).maybeSingle();
        if (!c) throw new Error("Campaign not found");
        if (c.external_id) await graph(`/${c.external_id}`, { token: userToken, method: "POST", body: { status: "ARCHIVED" } });
        await db.from("social_campaigns").update({ status: "archived", meta_effective_status: c.external_id ? "ARCHIVED" : null }).eq("id", c.id);
        return json({ success: true, status: "archived" });
      }

      case "sync_campaign_status": {
        const { data: rows } = await db
          .from("social_campaigns")
          .select("id,external_id")
          .not("external_id", "is", null);
        for (const r of rows || []) {
          try {
            const res = await graph(`/${r.external_id}`, { token: userToken, params: { fields: "status,effective_status" } });
            // Same vocabulary as import/publish; the raw Meta value is kept for the issues badge.
            await db.from("social_campaigns").update({
              status: localStatus(res.effective_status || res.status),
              meta_effective_status: res.effective_status ? String(res.effective_status).toUpperCase() : null,
              last_synced_at: new Date().toISOString(),
            }).eq("id", r.id);
          } catch (e) {
            console.error("sync failed for", r.external_id, (e as Error).message);
          }
        }
        return json({ success: true, synced: rows?.length || 0 });
      }

      /* ------------------------------ ad sets -------------------------------- */
      case "publish_adset": {
        const { data: adset } = await db.from("social_ad_sets").select("*").eq("id", payload.adset_id).maybeSingle();
        if (!adset) throw new Error("Ad Set not found");
        if (!adset.name) throw new Error("Ad Set name is required");

        const { data: camp } = await db.from("social_campaigns").select("*").eq("id", adset.campaign_id).maybeSingle();
        if (!camp) throw new Error("Campaign not found");
        if (!camp.external_id) throw new Error("Campaign must be published to Meta first");

        // Budget is required on either campaign or ad set, but not both
        const campaignHasBudget = camp.budget_amount && Number(camp.budget_amount) > 0;
        const adsetHasBudget = adset.budget_amount && Number(adset.budget_amount) > 0;
        if (!campaignHasBudget && !adsetHasBudget) {
          throw new Error("Ad Set or Campaign must have a budget amount");
        }

        // Keep the local record aligned with Meta's mutually exclusive budget
        // ownership rule. Existing records may still contain both values.
        if (campaignHasBudget && adset.budget_amount !== null) {
          const { error: clearBudgetError } = await db
            .from("social_ad_sets")
            .update({ budget_amount: null })
            .eq("id", adset.id);
          if (clearBudgetError) throw new Error(`Could not clear Ad Set budget: ${clearBudgetError.message}`);
        }

        // Fields the app owns. Legacy rows (range ages, free-text locations,
        // unapplied placement lists) are read with the same rules the form uses.
        const targeting: Record<string, unknown> = {};
        const ages = resolveAges(adset.targeting);
        targeting.age_min = ages.age_min;
        targeting.age_max = ages.age_max;
        const metaGenders = gendersToMeta(adset.targeting?.genders);
        if (metaGenders) targeting.genders = metaGenders;
        const explicitGeo = geoToMeta(adset.targeting);
        targeting.geo_locations = explicitGeo ?? { countries: ["IN"] };
        const placementPlan = readPlacements(adset.placements);
        // Only placements saved by the current form are applied; older rows
        // keep whatever Meta has (previously nothing was ever sent).
        const placementMode: "automatic" | "manual" | null = placementPlan.confirmed ? placementPlan.mode : null;
        if (placementMode === "manual") Object.assign(targeting, placementsToMeta(placementPlan.codes) || {});

        const rawAdAccount = camp.ad_account_id || conn.default_ad_account_id;
        if (!rawAdAccount) throw new Error("Select a default Ad Account first");
        const adAccount = normalizeActId(rawAdAccount);

        // Custom audience (customer list): restrict delivery to the uploaded people.
        let audienceExternalId: string | null = null;
        if (adset.custom_audience_id) {
          const { data: audience } = await db
            .from("social_custom_audiences")
            .select("id,name,external_id,status,ad_account_id")
            .eq("id", adset.custom_audience_id)
            .maybeSingle();
          if (!audience) {
            return json({ error: "The customer list chosen for this Ad Set no longer exists. Edit the Ad Set and pick another list." }, 400);
          }
          if (audience.status !== "ready" || !audience.external_id) {
            return json({ error: `Customer list "${audience.name}" is not ready on Meta (status: ${audience.status}). Upload it again or pick another list.` }, 400);
          }
          if (normalizeActId(audience.ad_account_id) !== adAccount) {
            return json({ error: `Customer list "${audience.name}" belongs to a different ad account than this campaign. Upload the list again under this campaign.` }, 400);
          }
          audienceExternalId = String(audience.external_id);
          targeting.custom_audiences = [{ id: audienceExternalId }];
          // Meta treats a lone custom audience as a "relaxed setup" and switches
          // Advantage+ audience on by default, which turns the list into a mere
          // suggestion. Opt out explicitly so delivery is restricted to the list.
          targeting.targeting_automation = { advantage_audience: 0 };
        }

        const bidStrategy = adset.bid_strategy || "LOWEST_COST_WITHOUT_CAP";
        const savedBidStrategy = BID_STRATEGY_MAP[bidStrategy] || "LOWEST_COST_WITHOUT_CAP";
        const bidAmount = Number(adset.bid_amount);
        if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
          return json({
            error: "Bid amount is required by Meta for this ad account. Edit the Ad Set, enter a positive Bid Amount, save it, and publish again.",
          }, 400);
        }
        // This account requires bidding controls even when the UI selection is
        // Lowest Cost. Convert that legacy selection to Meta's supported bid-cap
        // strategy so bid_amount and bid_strategy are always sent together.
        const mappedBidStrategy = savedBidStrategy === "LOWEST_COST_WITHOUT_CAP"
          ? "LOWEST_COST_WITH_BID_CAP"
          : savedBidStrategy;

        const body: Record<string, unknown> = {
          name: adset.name,
          optimization_goal: adset.optimization_goal || "LINK_CLICKS",
          billing_event: adset.billing_event || "LINK_CLICKS",
          status: "ACTIVE",
          targeting,
        };
        // Lead campaigns (OUTCOME_LEADS): Meta requires LEAD_GENERATION / QUALITY_LEAD,
        // billing on impressions, destination ON_AD and the promoted Page.
        if (camp.objective === "leads") {
          const leadPageId = adset.page_id || conn.default_page_id;
          if (!leadPageId) {
            return json({ error: "Lead ads need a Facebook Page. Choose a Page on the Ad Set (or a default Page under Communication Center → Meta) and publish again." }, 400);
          }
          Object.assign(body, leadAdSetFields(adset.optimization_goal, String(leadPageId)));
          // Pre-flight: name the exact Page and missing item instead of Meta's generic
          // "Terms of service not accepted" (which also fires when the token lacks pages_manage_ads).
          let granted: string[] | null = null;
          let tosAccepted: boolean | null | undefined = undefined;
          let leadPageName: string | null = null;
          try {
            const perms = await graph(`/me/permissions`, { token: userToken });
            granted = ((perms?.data || []) as Array<{ permission: string; status: string }>).filter((p) => p.status === "granted").map((p) => p.permission);
          } catch (e) { console.warn("publish_adset: could not read permissions:", (e as Error).message); }
          try {
            const pageTok = await pageToken(String(leadPageId));
            const page = await graph(`/${leadPageId}`, { token: pageTok, params: { fields: "name,leadgen_tos_accepted" } });
            tosAccepted = typeof page?.leadgen_tos_accepted === "boolean" ? page.leadgen_tos_accepted : null;
            leadPageName = page?.name || null;
          } catch (e) { console.warn("publish_adset: could not read page terms:", (e as Error).message); }
          const problem = leadPreflightProblem({ granted, tosAccepted, pageId: String(leadPageId), pageName: leadPageName });
          if (problem) return json({ error: problem, code: "lead_preflight" }, 400);
        }

        // Only set ad set budget if campaign doesn't have a budget
        // Meta: "You can only set an ad set budget or a campaign budget"
        if (!campaignHasBudget && adset.budget_amount && Number(adset.budget_amount) > 0) {
          if (adset.budget_type === "daily") {
            body.daily_budget = Math.round(Number(adset.budget_amount) * 100);
          } else {
            body.lifetime_budget = Math.round(Number(adset.budget_amount) * 100);
          }
        }

        body.bid_strategy = mappedBidStrategy;
        body.bid_amount = Math.round(bidAmount * 100);

        const adsetStart = adset.start_at || adset.start_date;
        const adsetEnd = adset.end_at || adset.end_date;
        if (adsetStart) body.start_time = new Date(adsetStart).toISOString();
        if (adsetEnd) body.end_time = new Date(adsetEnd).toISOString();

        body.campaign_id = camp.external_id;

        console.info("publish_adset payload", JSON.stringify({
          adset_id: adset.id,
          bid_strategy: body.bid_strategy,
          bid_amount: body.bid_amount,
          budget_source: campaignHasBudget ? "campaign" : "adset",
          campaign_budget_amount: campaignHasBudget ? camp.budget_amount : null,
          adset_budget_amount: body.daily_budget || body.lifetime_budget || null,
          optimization_goal: body.optimization_goal,
          billing_event: body.billing_event,
          custom_audience: audienceExternalId,
        }));

        const targetingPlan: TargetingPlan = {
          app: { ...targeting, __placement_codes: placementPlan.codes },
          applyGeo: explicitGeo !== null,
          placements: placementMode,
          applyAudience: audienceExternalId !== null,
        };

        // Re-link an ad set that exists on Meta under this exact campaign but
        // whose id never made it into our record — avoids a duplicate ad set.
        let created = adset.external_id
          ? null
          : await findExistingByName(`/${camp.external_id}/adsets`, adset.name, userToken);
        if (created) {
          console.info("publish_adset relinked existing Meta ad set", created.id);
          // Push the current local settings (schedule, budget, bidding,
          // targeting) onto the ad set we just re-linked.
          try {
            await updateExistingAdSet(created.id, userToken, body, targetingPlan);
          } catch (e) {
            const msg = (e as Error).message;
            console.error("publish_adset relink update error:", msg);
            throw new Error(`Failed to update ad set on Meta: ${msg}`);
          }
        } else if (adset.external_id) {
          // Already live on Meta: republish the edited settings instead of
          // creating a duplicate, so schedule/budget changes actually reach Meta.
          try {
            await updateExistingAdSet(adset.external_id, userToken, body, targetingPlan);
          } catch (e) {
            const msg = (e as Error).message;
            console.error("publish_adset update error:", msg);
            throw new Error(`Failed to update ad set on Meta: ${msg}`);
          }
          created = { id: adset.external_id };
        } else {
          try {
            created = await graph(`/${adAccount}/adsets`, { token: userToken, method: "POST", body });
          } catch (e) {
            const msg = (e as Error).message;
            console.error("publish_adset graph error:", msg);
            throw new Error(`Failed to publish ad set to Meta: ${msg}`);
          }
        }


        const adsetPublishedAt = new Date().toISOString();
        const adsetStatus = await readMetaStatus(created!.id, userToken);
        const { error: adsetSaveError } = await db.from("social_ad_sets").update({
          external_id: created!.id,
          published_at: adsetPublishedAt,
          status: adsetStatus,
          last_synced_at: adsetPublishedAt,
        }).eq("id", adset.id);
        if (adsetSaveError) {
          throw new Error(
            `Ad Set is live on Meta (id ${created!.id}) but saving it here failed: ${adsetSaveError.message}`,
          );
        }
        return json({ success: true, adset_id: created!.id, published_at: adsetPublishedAt, status: adsetStatus });
      }

      /* --------------------- custom audiences (customer lists) --------------------- */
      case "create_customer_list_audience": {
        const name = String(payload.name ?? "").trim();
        if (!name) return json({ error: "Audience name is required" }, 400);
        const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
        if (!rawRows.length) return json({ error: "The customer list is empty" }, 400);
        if (rawRows.length > AUDIENCE_MAX_ROWS * 2) {
          return json({ error: `Too many rows (${rawRows.length}). A customer list can hold at most ${AUDIENCE_MAX_ROWS} people.` }, 400);
        }
        const origin = payload.origin === "list_view" ? "list_view" : "file";
        const adAccount = normalizeActId(payload.ad_account_id || conn.default_ad_account_id);
        if (!adAccount) throw new Error("Select a default Ad Account first");

        const prepared = await prepareAudienceRows(rawRows);
        if (prepared.data.length < AUDIENCE_MIN_ROWS) {
          return json({
            error: `Meta needs at least ${AUDIENCE_MIN_ROWS} valid people in a customer list; ${prepared.data.length} usable rows were found (${prepared.invalid} invalid, ${prepared.duplicates} duplicates).`,
            valid: prepared.data.length, invalid: prepared.invalid, duplicates: prepared.duplicates,
          }, 400);
        }
        if (prepared.data.length > AUDIENCE_MAX_ROWS) {
          return json({ error: `This list has ${prepared.data.length} valid people; the limit per list is ${AUDIENCE_MAX_ROWS}.` }, 400);
        }

        const created = await step("Create custom audience on Meta", () => graph(`/${adAccount}/customaudiences`, {
          token: userToken,
          method: "POST",
          body: {
            name,
            description: payload.description ? String(payload.description) : `Customer list uploaded from the app (${origin === "list_view" ? "list view" : "file"})`,
            subtype: "CUSTOM",
            customer_file_source: "USER_PROVIDED_ONLY",
          },
        }));
        const audienceId = String(created.id);

        let received = 0;
        try {
          received = await uploadAudienceRows(audienceId, userToken, prepared.data, step);
        } catch (e) {
          // Leave no half-filled audience behind on Meta.
          try { await graph(`/${audienceId}`, { token: userToken, method: "DELETE" }); } catch (_) { /* ignore */ }
          throw e;
        }

        const metaStatus = await readAudienceStatus(audienceId, userToken);
        const { data: saved, error: saveError } = await db
          .from("social_custom_audiences")
          .insert({
            platform: "meta",
            connection_id: conn.id,
            ad_account_id: adAccount,
            external_id: audienceId,
            name,
            description: payload.description ? String(payload.description) : null,
            source: "customer_list",
            origin,
            origin_ref: payload.origin_ref ? String(payload.origin_ref) : null,
            identifier_schema: ["EMAIL", "PHONE"],
            row_count: prepared.data.length,
            invalid_count: Number(payload.invalid_count ?? prepared.invalid) || 0,
            duplicate_count: Number(payload.duplicate_count ?? prepared.duplicates) || 0,
            status: "ready",
            meta_status: metaStatus,
            created_by: authUserId ?? null,
          })
          .select("*")
          .single();
        if (saveError) {
          throw new Error(`Audience is live on Meta (id ${audienceId}) but saving it here failed: ${saveError.message}`);
        }
        console.info("create_customer_list_audience", JSON.stringify({
          audience_id: audienceId, ad_account: adAccount, rows: prepared.data.length, received,
          invalid: prepared.invalid, duplicates: prepared.duplicates, origin,
        }));
        return json({ success: true, audience: saved, received });
      }

      case "refresh_custom_audience": {
        const { data: audience } = await db.from("social_custom_audiences").select("*").eq("id", payload.audience_id).maybeSingle();
        if (!audience) throw new Error("Audience not found");
        if (!audience.external_id) return json({ error: "This audience was never created on Meta" }, 400);
        const metaStatus = await readAudienceStatus(String(audience.external_id), userToken);
        await db.from("social_custom_audiences").update({ meta_status: metaStatus }).eq("id", audience.id);
        return json({ success: true, meta_status: metaStatus });
      }

      case "delete_custom_audience": {
        const { data: audience } = await db.from("social_custom_audiences").select("*").eq("id", payload.audience_id).maybeSingle();
        if (!audience) throw new Error("Audience not found");
        if (audience.external_id) {
          try {
            await step("Delete custom audience on Meta", () => graph(`/${audience.external_id}`, { token: userToken, method: "DELETE" }));
          } catch (e) {
            const msg = (e as Error).message;
            if (!/does not exist|not found|Unsupported get request/i.test(msg)) throw e;
          }
        }
        // FK on social_ad_sets.custom_audience_id is ON DELETE SET NULL.
        const { error } = await db.from("social_custom_audiences").delete().eq("id", audience.id);
        if (error) throw new Error(`Could not delete audience locally: ${error.message}`);
        return json({ success: true });
      }

      case "pause_adset":
      case "resume_adset": {
        const { data: adset } = await db.from("social_ad_sets").select("*").eq("id", payload.adset_id).maybeSingle();
        if (!adset) throw new Error("Ad Set not found");
        const next = action === "pause_adset" ? "PAUSED" : "ACTIVE";
        if (adset.external_id) {
          const statusBody: Record<string, unknown> = { status: next };
          // Resume must also push the saved end date. Previously it changed
          // only status, leaving Meta's expired schedule untouched.
          const savedEnd = adset.end_at || adset.end_date;
          if (action === "resume_adset" && savedEnd) {
            statusBody.end_time = new Date(savedEnd).toISOString();
          }
          await step(
            action === "resume_adset" ? "Update Ad Set schedule and resume" : "Pause Ad Set",
            () => graph(`/${adset.external_id}`, { token: userToken, method: "POST", body: statusBody }),
          );
        }
        await db.from("social_ad_sets").update({
          status: next.toLowerCase(),
          last_synced_at: new Date().toISOString(),
        }).eq("id", adset.id);
        return json({ success: true, status: next.toLowerCase() });
      }

      case "delete_adset": {
        const { data: adset } = await db.from("social_ad_sets").select("*").eq("id", payload.adset_id).maybeSingle();
        if (adset?.external_id) {
          try {
            await graph(`/${adset.external_id}`, { token: userToken, method: "DELETE" });
          } catch (e) {
            console.error("Meta delete failed, removing locally:", (e as Error).message);
          }
        }
        await db.from("social_ad_sets").delete().eq("id", payload.adset_id);
        return json({ success: true });
      }

      case "fetch_adset_insights": {
        const { data: rows } = await db
          .from("social_ad_sets")
          .select("id,external_id")
          .not("external_id", "is", null);
        const today = new Date().toISOString().slice(0, 10);
        for (const r of rows || []) {
          try {
            const res = await graph(`/${r.external_id}/insights`, {
              token: userToken,
              params: { fields: "reach,impressions,clicks,spend,actions,action_values", date_preset: "maximum" },
            });
            const d = res?.data?.[0];
            if (!d) continue;
            const actionCount = (t: string) =>
              Number((d.actions || []).find((a: any) => a.action_type === t)?.value || 0);
            const revenue = Number(
              (d.action_values || []).find((a: any) => a.action_type === "purchase")?.value || 0,
            );
            await db.from("social_insights").upsert({
              platform: "meta",
              entity_type: "adset",
              entity_id: r.id,
              external_id: r.external_id,
              stat_date: today,
              reach: Number(d.reach || 0),
              impressions: Number(d.impressions || 0),
              clicks: Number(d.clicks || 0),
              spend: Number(d.spend || 0),
              leads: actionCount("lead"),
              purchases: actionCount("purchase"),
              conversions: actionCount("offsite_conversion"),
              revenue,
              raw: d,
            }, { onConflict: "entity_type,entity_id,stat_date" });
          } catch (e) {
            console.error("insights failed for", r.external_id, (e as Error).message);
          }
        }
        return json({ success: true });
      }

      /* --------------------------------- ads --------------------------------- */
      /* ------------------------------ lead ads ------------------------------ */
      /* ------------------------------ instagram ------------------------------ */
      case "list_ad_instagram_accounts": {
        // Instagram profiles usable as an ad's identity (Ads Manager "Identity → Instagram
        // profile"): GET /act_{id}/instagram_accounts. Live read, nothing stored. A private
        // account attached to the ad account / business appears here too.
        const wanted = normalizeActId(payload.ad_account_id) || null;
        let actIds: string[] = [];
        if (wanted) actIds = [wanted];
        else {
          const { data: accts } = await db.from("social_ad_accounts").select("ad_account_id").eq("connection_id", conn.id);
          actIds = (accts || []).map((a: { ad_account_id: string | null }) => normalizeActId(a.ad_account_id)).filter((x: string | null): x is string => !!x);
        }
        const accounts: Array<{ ad_account_id: string; id: string; username: string | null; profile_pic: string | null }> = [];
        const errors: Array<{ ad_account_id: string; message: string }> = [];
        const seen = new Set<string>();
        for (const act of actIds) {
          try {
            // Meta rejects profile_pic on this edge ("(#100) Tried accessing nonexisting field"),
            // so ask for id,username and fall back to id alone if username is refused too.
            let res: { data?: unknown[] } | undefined;
            try {
              res = await graph(`/${act}/instagram_accounts`, { token: userToken, params: { fields: "id,username", limit: "100" } });
            } catch (e) {
              if (!/\(#100\)/.test((e as Error).message)) throw e;
              res = await graph(`/${act}/instagram_accounts`, { token: userToken, params: { fields: "id", limit: "100" } });
            }
            for (const a of (res?.data || []) as Array<{ id?: unknown; username?: unknown; profile_pic?: unknown }>) {
              const id = String(a?.id ?? "");
              if (!id || seen.has(id)) continue;
              seen.add(id);
              accounts.push({ ad_account_id: act, id, username: a.username ? String(a.username) : null, profile_pic: a.profile_pic ? String(a.profile_pic) : null });
            }
          } catch (e) {
            errors.push({ ad_account_id: act, message: (e as Error).message });
          }
        }
        return json({ accounts, errors });
      }

      case "sync_instagram_accounts": {
        // Re-read each Page's linked Instagram professional account without reconnecting
        // (for after the account is linked on Meta). Also reports which Instagram
        // permissions the token lacks, the usual reason the list is empty.
        const result: {
          pages: Array<{ page_id: string; page_name: string | null; instagram_id: string | null; instagram_username: string | null; error: string | null }>;
          missing_permissions: string[];
          errors: string[];
        } = { pages: [], missing_permissions: [], errors: [] };
        try {
          const perms = await graph(`/me/permissions`, { token: userToken });
          const granted = new Set<string>(((perms?.data || []) as Array<{ permission: string; status: string }>).filter((p) => p.status === "granted").map((p) => p.permission));
          result.missing_permissions = INSTAGRAM_PERMISSIONS.filter((n) => !granted.has(n));
        } catch (e) {
          result.errors.push(`Permissions: ${(e as Error).message}`);
        }
        const { data: pageRows, error: pagesErr } = await db
          .from("social_pages")
          .select("id, page_id, page_name, page_token_enc")
          .eq("connection_id", conn.id)
          .order("page_name");
        if (pagesErr) return json({ error: pagesErr.message }, 500);
        for (const row of pageRows || []) {
          const pageTok = row.page_token_enc ? await decryptSecret(row.page_token_enc) : null;
          const ig = await resolveInstagramAccount(String(row.page_id), { user: userToken, page: pageTok });
          const instagram_id = ig.account?.id ?? null;
          const instagram_username = ig.account?.username ?? null;
          // Only write what Meta actually answered; an error keeps the stored value.
          if (!ig.error) await db.from("social_pages").update({ instagram_id, instagram_username }).eq("id", row.id);
          result.pages.push({ page_id: String(row.page_id), page_name: row.page_name ?? null, instagram_id, instagram_username, error: ig.error });
        }
        return json(result);
      }

      case "lead_ads_readiness": {
        // Page terms (leadgen_tos_accepted) and the two permissions lead forms need.
        const pageId = String(payload.page_id || conn.default_page_id || "");
        if (!pageId) return json({ error: "Choose a Facebook Page first" });
        const result: Record<string, unknown> = { page_id: pageId, tos_accepted: null, tos_time: null, permissions: {}, missing_permissions: [] as string[], errors: [] as string[] };
        try {
          const perms = await graph(`/me/permissions`, { token: userToken });
          const granted = new Set<string>(((perms?.data || []) as Array<{ permission: string; status: string }>).filter((p) => p.status === "granted").map((p) => p.permission));
          const needed = ["pages_manage_ads", "leads_retrieval", "ads_management", "pages_read_engagement"];
          result.permissions = Object.fromEntries(needed.map((n) => [n, granted.has(n)]));
          result.missing_permissions = needed.filter((n) => !granted.has(n));
        } catch (e) {
          (result.errors as string[]).push(`Permissions: ${(e as Error).message}`);
        }
        try {
          const token = await pageToken(pageId);
          const page = await graph(`/${pageId}`, { token, params: { fields: "leadgen_tos_accepted,leadgen_tos_acceptance_time,name" } });
          result.tos_accepted = page?.leadgen_tos_accepted ?? null;
          result.tos_time = page?.leadgen_tos_acceptance_time ?? null;
          result.page_name = page?.name ?? null;
        } catch (e) {
          (result.errors as string[]).push(`Page terms: ${(e as Error).message}`);
        }
        return json(result);
      }
      case "list_lead_forms": {
        const pageId = String(payload.page_id || conn.default_page_id || "");
        if (!pageId) return json({ error: "Choose a Facebook Page first" });
        const localRows = async () => (await db.from("social_lead_forms").select("*").eq("page_id", pageId).order("created_at", { ascending: false })).data || [];
        let res: any;
        try {
          const token = await pageToken(pageId);
          await pushPendingLeadForms(db, pageId, token);
          res = await graph(`/${pageId}/leadgen_forms`, {
            token,
            params: { fields: "id,name,status,leads_count,created_time,questions,privacy_policy_url,follow_up_action_url,locale", limit: "100" },
          });
        } catch (e) {
          if (!isLeadAccessBlocked(e)) throw e;
          // Missing pages_manage_ads / Lead Ads Terms: show what we have locally instead of failing.
          return json({ forms: await localRows(), blocked: (e as Error).message });
        }
        const forms = (res?.data || []) as Array<Record<string, unknown>>;
        for (const f of forms) {
          await db.from("social_lead_forms").upsert({
            platform: "meta",
            connection_id: conn.id,
            page_id: pageId,
            external_id: String(f.id),
            name: String(f.name || "Untitled form"),
            questions: f.questions || [],
            privacy_policy_url: (f.privacy_policy_url as string) || null,
            follow_up_action_url: (f.follow_up_action_url as string) || null,
            locale: (f.locale as string) || "EN_US",
            status: String(f.status || "ACTIVE"),
            leads_count: Number(f.leads_count || 0),
            imported: true,
          }, { onConflict: "external_id", ignoreDuplicates: false });
        }
        // Rows created by the app but never returned by Meta stay as they are.
        const { data: rows } = await db.from("social_lead_forms").select("*").eq("page_id", pageId).order("created_at", { ascending: false });
        return json({ forms: rows || [] });
      }
      case "create_lead_form": {
        const pageId = String(payload.page_id || conn.default_page_id || "");
        if (!pageId) return json({ error: "Choose a Facebook Page first" });
        const input = (payload.form || {}) as LeadFormInput;
        const problems = validateLeadForm(input);
        if (problems.length) return json({ error: problems.join(". ") }, 400);
        const body = buildLeadFormPayload(input);
        let created: { id: string };
        try {
          const token = await pageToken(pageId);
          created = await graph(`/${pageId}/leadgen_forms`, { token, method: "POST", body });
        } catch (e) {
          if (!isLeadAccessBlocked(e)) throw e;
          // Meta isn't ready yet (permissions / Lead Ads Terms): keep the form and send it later.
          const { data: saved, error: saveErr } = await db.from("social_lead_forms").insert({
            platform: "meta",
            connection_id: conn.id,
            page_id: pageId,
            external_id: null,
            name: String(body.name),
            questions: body.questions,
            privacy_policy_url: (body.privacy_policy as { url: string }).url,
            privacy_link_text: (body.privacy_policy as { link_text: string }).link_text,
            follow_up_action_url: (body.follow_up_action_url as string) || null,
            thank_you_page: body.thank_you_page || null,
            context_card: body.context_card || null,
            locale: String(body.locale),
            is_optimized_for_quality: !!body.is_optimized_for_quality,
            block_display_for_non_targeted_viewer: !!body.block_display_for_non_targeted_viewer,
            status: "PENDING_META",
            draft_payload: body,
            imported: false,
            created_by: authUserId || null,
          }).select("*").single();
          if (saveErr) throw new Error(`Could not save the form: ${saveErr.message}`);
          return json({ success: true, pending: true, form: saved, reason: (e as Error).message });
        }
        const row = {
          platform: "meta",
          connection_id: conn.id,
          page_id: pageId,
          external_id: String(created.id),
          name: String(body.name),
          questions: body.questions,
          privacy_policy_url: (body.privacy_policy as { url: string }).url,
          privacy_link_text: (body.privacy_policy as { link_text: string }).link_text,
          follow_up_action_url: (body.follow_up_action_url as string) || null,
          thank_you_page: body.thank_you_page || null,
          context_card: body.context_card || null,
          locale: String(body.locale),
          is_optimized_for_quality: !!body.is_optimized_for_quality,
          block_display_for_non_targeted_viewer: !!body.block_display_for_non_targeted_viewer,
          status: "ACTIVE",
          imported: false,
          created_by: authUserId || null,
        };
        const { data: saved, error: saveErr } = await db.from("social_lead_forms").insert(row).select("*").single();
        if (saveErr) throw new Error(`Form is live on Meta (id ${created.id}) but saving it here failed: ${saveErr.message}`);
        return json({ success: true, form: saved, sent: body });
      }
      case "archive_lead_form": {
        const formId = String(payload.form_id || "");
        if (!formId) return json({ error: "form_id is required" });
        const { data: row } = await db.from("social_lead_forms").select("*").eq("external_id", formId).maybeSingle();
        const token = await pageToken(String(row?.page_id || payload.page_id || conn.default_page_id || ""));
        await step("Archive lead form on Meta", () => graph(`/${formId}`, { token, method: "POST", body: { status: "ARCHIVED" } }));
        await db.from("social_lead_forms").update({ status: "ARCHIVED" }).eq("external_id", formId);
        return json({ success: true });
      }
      case "sync_leads": {
        // GET /{ad-id}/leads (or /{form-id}/leads) → social_lead_submissions only. CRM leads are
        // created by save_lead_submissions after the user confirms in the "Fetch leads" dialog.
        const { data: ad } = payload.ad_id ? await db.from("social_ads").select("*").eq("id", payload.ad_id).maybeSingle() : { data: null };
        const formId = String(payload.form_id || ad?.lead_form_id || "");
        if (!formId) return json({ error: "This ad has no lead form" });
        const { data: formRow } = await db.from("social_lead_forms").select("page_id,name").eq("external_id", formId).maybeSingle();
        const pageId = String(formRow?.page_id || payload.page_id || conn.default_page_id || "");
        if (!pageId) return json({ error: "Choose a Facebook Page first" });
        const token = await pageToken(pageId);
        const params: Record<string, string> = { fields: "id,created_time,ad_id,form_id,field_data,is_organic", limit: "100" };
        if (payload.since) {
          const sinceUnix = Math.floor(new Date(String(payload.since)).getTime() / 1000);
          if (Number.isFinite(sinceUnix)) params.filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceUnix }]);
        }
        const source = ad?.external_id && !payload.form_id ? `/${ad.external_id}/leads` : `/${formId}/leads`;
        let fetched = 0, created = 0, skipped = 0;
        let after: string | null = null;
        for (let page = 0; page < 20; page++) {
          const res = await step("Read leads from Meta", () => graph(source, { token, params: after ? { ...params, after } : params }));
          const items = (res?.data || []) as Array<Record<string, unknown>>;
          for (const item of items) {
            fetched++;
            const externalId = String(item.id);
            const { data: existing } = await db.from("social_lead_submissions").select("id").eq("external_id", externalId).maybeSingle();
            if (existing) { skipped++; continue; }
            await db.from("social_lead_submissions").insert({
              platform: "meta",
              external_id: externalId,
              form_external_id: String(item.form_id || formId),
              ad_external_id: item.ad_id ? String(item.ad_id) : null,
              ad_id: ad?.id || null,
              lead_id: null,
              created_time: item.created_time ? new Date(String(item.created_time)).toISOString() : null,
              is_organic: item.is_organic == null ? null : !!item.is_organic,
              field_data: item.field_data || [],
            });
            created++;
          }
          after = res?.paging?.cursors?.after && res?.paging?.next ? String(res.paging.cursors.after) : null;
          if (!after) break;
        }
        return json({ success: true, fetched, created, skipped });
      }
      case "save_lead_submissions": {
        // "Save to Leads" from the Fetch leads dialog, after the user confirmed.
        // Creates one lead per unsaved submission; a submission whose phone already belongs
        // to a lead is linked to that lead instead (no duplicates, existing lead untouched).
        const { data: ad } = await db.from("social_ads").select("id, name, external_id").eq("id", payload.ad_id).maybeSingle();
        if (!ad) return json({ error: "Ad not found" }, 404);
        const filters = [`ad_id.eq.${ad.id}`];
        if (ad.external_id) filters.push(`ad_external_id.eq.${ad.external_id}`);
        const { data: subs, error: subsErr } = await db
          .from("social_lead_submissions")
          .select("id, field_data, created_time")
          .or(filters.join(","))
          .is("lead_id", null)
          .order("created_time", { ascending: true });
        if (subsErr) return json({ error: subsErr.message }, 500);
        const result = { total: (subs || []).length, saved: 0, already_in_leads: 0, skipped_no_phone: 0, interest: `Meta - ${ad.name}` };
        const { data: existingLeads } = await db.from("leads").select("id, phone").not("phone", "is", null).limit(100000);
        const byPhone = new Map<string, string>();
        for (const l of existingLeads || []) {
          const k = phoneMatchKey(l.phone);
          if (k && !byPhone.has(k)) byPhone.set(k, String(l.id));
        }
        for (const sub of subs || []) {
          const row = leadInsertFromSubmission(sub.field_data as Array<{ name?: string; values?: unknown[] }>, String(ad.name || ""));
          if (!row) { result.skipped_no_phone++; continue; }
          const key = phoneMatchKey(row.phone);
          let leadId = key ? byPhone.get(key) : undefined;
          if (leadId) {
            result.already_in_leads++;
          } else {
            const { data: lead, error: leadErr } = await db.from("leads").insert(row).select("id").single();
            if (leadErr) throw new Error(`Could not save lead "${row.name}": ${leadErr.message}`);
            leadId = String(lead.id);
            if (key) byPhone.set(key, leadId);
            result.saved++;
          }
          await db.from("social_lead_submissions").update({ lead_id: leadId }).eq("id", sub.id);
        }
        return json({ success: true, ...result });
      }
      case "publish_ad": {
        const { data: ad } = await db.from("social_ads").select("*").eq("id", payload.ad_id).maybeSingle();
        if (!ad) throw new Error("Ad not found");

        const { data: adset } = await db.from("social_ad_sets").select("*").eq("id", ad.ad_set_id).maybeSingle();
        if (!adset?.external_id) throw new Error("Publish the Ad Set to Meta first");

        const { data: camp } = await db.from("social_campaigns").select("*").eq("id", adset.campaign_id).maybeSingle();
        const adAccount = camp?.ad_account_id || conn.default_ad_account_id;
        if (!adAccount) throw new Error("Select a default Ad Account first");

        const pageId = adset.page_id || conn.default_page_id;
        if (!pageId) throw new Error("Select a default Facebook Page first");

        // Validate the creative before touching Meta so schedule sync is not wasted.
        let objectStorySpec: Record<string, unknown>;
        const isLeadCampaign = camp?.objective === "leads";
        try {
          if (isLeadCampaign) {
            if (!ad.lead_form_id) {
              return json({ error: "This campaign's objective is Leads: choose or create a lead form on the ad before publishing." }, 400);
            }
            if (String(ad.lead_form_id).startsWith("pending:")) {
              let blocked: string | null = null;
              try {
                const r = await pushPendingLeadForms(db, String(pageId), await pageToken(String(pageId)));
                blocked = r.blocked;
              } catch (e) {
                if (!isLeadAccessBlocked(e)) throw e;
                blocked = (e as Error).message;
              }
              const { data: fresh } = await db.from("social_ads").select("lead_form_id").eq("id", ad.id).maybeSingle();
              if (!fresh?.lead_form_id || String(fresh.lead_form_id).startsWith("pending:")) {
                return json({
                  error: "The lead form on this ad is saved but still waiting for Meta. Reconnect Meta in Communication → Meta (tick every permission, including pages_manage_ads) and have a Page admin accept the Lead Ads Terms, then publish again." + (blocked ? ` (Meta said: ${blocked})` : ""),
                  code: "lead_form_pending",
                }, 409);
              }
              ad.lead_form_id = fresh.lead_form_id;
            }
            const leadMedia = readAdMedia(ad.media);
            let imageHash: string | null = null;
            if (leadMedia && leadMedia.kind !== "video") {
              imageHash = await step("Upload ad image to Meta", () => ensureImageHash(ad, adAccount, userToken, db));
            }
            objectStorySpec = buildLeadObjectStorySpec(
              { ...ad, media: leadMedia },
              pageId,
              String(ad.lead_form_id),
              imageHash,
            );
          } else {
            objectStorySpec = buildObjectStorySpec(ad, pageId);
          }
        } catch (e) {
          return json({ error: (e as Error).message }, 400);
        }
        // Instagram identity (Ads Manager "Identity → Instagram profile"); the ad's own choice,
        // else the connection default, else Meta's Page-backed account.
        objectStorySpec = withInstagramIdentity(objectStorySpec, ad.instagram_user_id || conn.default_ad_instagram_id || null);

        // Videos: re-check processing state on Meta right before publishing.
        const publishMedia = readAdMedia(ad.media);
        if (publishMedia?.kind === "video" && publishMedia.video_id) {
          const live = await step("Check video on Meta", () => graph(`/${publishMedia.video_id}`, {
            token: userToken, params: { fields: "status" },
          }));
          const liveStatus = videoStatusFromMeta(live);
          if (liveStatus !== publishMedia.video_status) {
            await db.from("social_ads").update({ media: { ...(ad.media as Record<string, unknown>), video_status: liveStatus } }).eq("id", ad.id);
          }
          if (liveStatus !== "ready") {
            return json({
              error: liveStatus === "error"
                ? "Meta could not process this video. Upload it again."
                : "The video is still processing on Meta. Try again in a minute.",
            }, 400);
          }
        }

        // Push the saved schedule before creating the Ad. This prevents a stale
        // Meta end date from rejecting an Ad even after the date was edited here.
        const savedAdSetEnd = adset.end_at || adset.end_date;
        if (savedAdSetEnd) {
          await step("Synchronize Ad Set schedule", () => graph(`/${adset.external_id}`, {
            token: userToken,
            method: "POST",
            body: { end_time: new Date(savedAdSetEnd).toISOString() },
          }));
          await db.from("social_ad_sets").update({ last_synced_at: new Date().toISOString() }).eq("id", adset.id);
        } else {
          // Confirm the parent still exists even when no end date is configured.
          await step("Verify Ad Set", () => graph(`/${adset.external_id}`, {
            token: userToken,
            params: { fields: "id,status" },
          }));
        }

        const creative = await step("Build ad creative", () => graph(`/${adAccount}/adcreatives`, {
          token: userToken,
          method: "POST",
          body: {
            name: `${ad.name} creative`,
            object_story_spec: objectStorySpec,
            contextual_multi_ads: multiAdvertiserSpec(ad),
          },
        }));

        const desiredStatus = ad.external_id && ad.status === "active" ? "ACTIVE" : "PAUSED";

        let metaAdId = ad.external_id as string | null;
        try {
          if (!metaAdId) {
            // Re-link an ad that already exists on Meta under this same ad set.
            const existingAd = await findExistingByName(`/${adset.external_id}/ads`, ad.name, userToken);
            if (existingAd) {
              metaAdId = existingAd.id;
              console.info("publish_ad relinked existing Meta ad", metaAdId);
            }
          }

          if (metaAdId) {
            // republish edited creative onto the existing Meta ad
            await step("Update ad on Meta", () => graph(`/${metaAdId}`, {
              token: userToken,
              method: "POST",
              body: { name: ad.name, creative: { creative_id: creative.id }, status: desiredStatus },
            }));
          } else {
            const createdAd = await step("Create ad on Meta", () => graph(`/${adAccount}/ads`, {
              token: userToken,
              method: "POST",
              body: {
                name: ad.name,
                adset_id: adset.external_id,
                creative: { creative_id: creative.id },
                status: "PAUSED",
              },
            }));
            metaAdId = createdAd.id;
          }
        } catch (e) {
          // roll back the orphaned creative so retries stay clean
          try { await graph(`/${creative.id}`, { token: userToken, method: "DELETE" }); } catch (_) { /* ignore */ }
          throw e;
        }


        const adStatus = await readMetaStatus(metaAdId!, userToken, desiredStatus.toLowerCase());
        const { error: adSaveError } = await db.from("social_ads").update({
          external_id: metaAdId,
          creative_external_id: creative.id,
          status: adStatus,
        }).eq("id", ad.id);
        if (adSaveError) {
          throw new Error(`Ad is live on Meta (id ${metaAdId}) but saving it here failed: ${adSaveError.message}`);
        }

        return json({
          success: true,
          external_id: metaAdId,
          creative_external_id: creative.id,
          status: adStatus,
        });
      }

      /* ------------------------------ ad videos ------------------------------ */
      case "register_ad_video": {
        const fileUrl = String(payload.file_url ?? "").trim();
        if (!/^https?:\/\//i.test(fileUrl)) return json({ error: "A public video URL is required" }, 400);
        const { data: adset } = await db.from("social_ad_sets").select("id,campaign_id").eq("id", payload.ad_set_id).maybeSingle();
        if (!adset) throw new Error("Ad Set not found");
        const { data: camp } = await db.from("social_campaigns").select("ad_account_id").eq("id", adset.campaign_id).maybeSingle();
        const adAccount = normalizeActId(camp?.ad_account_id || conn.default_ad_account_id);
        if (!adAccount) throw new Error("Select a default Ad Account first");
        const title = String(payload.title || "Ad video").slice(0, 250);
        const created = await step("Register video on Meta", () => graph(`/${adAccount}/advideos`, {
          token: userToken,
          method: "POST",
          body: { file_url: fileUrl, title, name: title },
        }));
        const videoId = String(created.id ?? created.video_id);
        let videoStatus: "processing" | "ready" | "error" = "processing";
        try {
          const live = await graph(`/${videoId}`, { token: userToken, params: { fields: "status" } });
          videoStatus = videoStatusFromMeta(live);
        } catch (_) { /* status is polled later */ }
        return json({ success: true, video_id: videoId, video_status: videoStatus });
      }

      case "check_ad_video": {
        const videoId = String(payload.video_id ?? "").trim();
        if (!/^\d+$/.test(videoId)) return json({ error: "video_id is required" }, 400);
        const live = await step("Check video on Meta", () => graph(`/${videoId}`, {
          token: userToken, params: { fields: "status,thumbnails{uri,is_preferred}" },
        }));
        const thumbs: Array<{ uri?: string; is_preferred?: boolean }> = live?.thumbnails?.data || [];
        const preferred = thumbs.find((t) => t.is_preferred) || thumbs[0];
        return json({
          success: true,
          video_status: videoStatusFromMeta(live),
          thumbnail_url: preferred?.uri || null,
          processing_progress: live?.status?.processing_progress ?? null,
        });
      }

      case "pause_ad":
      case "resume_ad": {
        const { data: ad } = await db.from("social_ads").select("*").eq("id", payload.ad_id).maybeSingle();
        if (!ad) throw new Error("Ad not found");
        const next = action === "pause_ad" ? "PAUSED" : "ACTIVE";
        if (!ad.external_id) throw new Error("Publish this ad to Meta first");
        await graph(`/${ad.external_id}`, { token: userToken, method: "POST", body: { status: next } });
        await db.from("social_ads").update({ status: next.toLowerCase() }).eq("id", ad.id);
        return json({ success: true, status: next.toLowerCase() });
      }

      case "delete_ad": {
        const { data: ad } = await db.from("social_ads").select("*").eq("id", payload.ad_id).maybeSingle();
        if (ad?.external_id) {
          try { await graph(`/${ad.external_id}`, { token: userToken, method: "DELETE" }); } catch (e) {
            console.error("Meta ad delete failed, removing locally:", (e as Error).message);
          }
        }
        await db.from("social_ads").delete().eq("id", payload.ad_id);
        return json({ success: true });
      }

      case "sync_ad_status": {
        const { data: rows } = await db.from("social_ads").select("id,external_id").not("external_id", "is", null);
        for (const r of rows || []) {
          try {
            const res = await graph(`/${r.external_id}`, { token: userToken, params: { fields: "status,effective_status" } });
            await db.from("social_ads").update({
              status: String(res.effective_status || res.status || "").toLowerCase() || "paused",
            }).eq("id", r.id);
          } catch (e) {
            console.error("ad sync failed for", r.external_id, (e as Error).message);
          }
        }
        return json({ success: true, synced: rows?.length || 0 });
      }



      /* --------------------------- organic posting -------------------------- */
      case "publish_post": {
        const { data: p } = await db.from("social_posts").select("*").eq("id", payload.post_id).maybeSingle();
        if (!p) throw new Error("Post not found");

        const pageId = p.page_id || conn.default_page_id;
        const igId = p.instagram_id || conn.default_instagram_id;
        let fbPostId: string | null = null;
        let igPostId: string | null = null;

        // Facebook native scheduling: 10 minutes .. 75 days ahead, published=false
        const scheduledMs = p.scheduled_at ? new Date(p.scheduled_at).getTime() : 0;
        const nowMs = Date.now();
        const isScheduled = scheduledMs > nowMs + 60_000;
        if (isScheduled) {
          if (scheduledMs < nowMs + 10 * 60_000) {
            throw new Error("Facebook requires the scheduled time to be at least 10 minutes in the future");
          }
          if (scheduledMs > nowMs + 75 * 24 * 60 * 60_000) {
            throw new Error("Facebook cannot schedule a post more than 75 days in advance");
          }
          if (p.destination === "instagram" || p.destination === "both") {
            throw new Error("Instagram does not support scheduled publishing via the API — publish now, or set the destination to Facebook only");
          }
        }
        const scheduleFields = isScheduled
          ? { published: false, scheduled_publish_time: Math.floor(scheduledMs / 1000) }
          : {};

        try {
          if (p.destination === "facebook" || p.destination === "both") {
            if (!pageId) throw new Error("No Facebook Page selected");
            const token = await pageToken(pageId);
            if (p.post_type === "image" && p.media_url && isScheduled) {
              // Facebook rejects scheduled_publish_time on /photos. Upload the photo
              // unpublished, then create a scheduled feed post that attaches it.
              const photo = await graph(`/${pageId}/photos`, {
                token, method: "POST", body: { url: p.media_url, published: false },
              });
              const r = await graph(`/${pageId}/feed`, {
                token,
                method: "POST",
                body: {
                  message: p.message ?? "",
                  attached_media: [{ media_fbid: photo.id }],
                  ...scheduleFields,
                },
              });
              fbPostId = r.id;
            } else if (p.post_type === "image" && p.media_url) {
              const r = await graph(`/${pageId}/photos`, {
                token, method: "POST", body: { url: p.media_url, caption: p.message ?? "", ...scheduleFields },
              });
              fbPostId = r.post_id || r.id;
            } else if (p.post_type === "video" && p.media_url) {
              const r = await graph(`/${pageId}/videos`, {
                token, method: "POST", body: { file_url: p.media_url, description: p.message ?? "", ...scheduleFields },
              });
              fbPostId = r.id;
            } else {
              const r = await graph(`/${pageId}/feed`, {
                token, method: "POST", body: { message: p.message ?? "", ...scheduleFields },
              });
              fbPostId = r.id;
            }
          }

          if (p.destination === "instagram" || p.destination === "both") {
            if (!igId) throw new Error("No Instagram account selected");
            if (!p.media_url) throw new Error("Instagram posts require an image or video");
            const token = await pageToken(pageId!);
            const container = await graph(`/${igId}/media`, {
              token,
              method: "POST",
              body: p.post_type === "video"
                ? { media_type: "REELS", video_url: p.media_url, caption: p.message ?? "" }
                : { image_url: p.media_url, caption: p.message ?? "" },
            });
            const published = await graph(`/${igId}/media_publish`, {
              token, method: "POST", body: { creation_id: container.id },
            });
            igPostId = published.id;
          }
        } catch (e) {
          const raw = (e as Error).message;
          const msg = /\(#200\)|#283|pages_manage_posts|pages_read_engagement/.test(raw)
            ? `${raw} — the Page access token is missing publishing permissions. Reconnect Meta and make sure the Page is selected and "Manage posts" / "Read engagement" access is granted.`
            : raw;
          await db.from("social_posts").update({
            status: "failed", error_message: msg,
          }).eq("id", p.id);
          throw new Error(msg);
        }

        await db.from("social_posts").update({
          status: isScheduled ? "scheduled" : "published",
          facebook_post_id: fbPostId,
          instagram_post_id: igPostId,
          published_at: isScheduled ? null : new Date().toISOString(),
          error_message: null,
        }).eq("id", p.id);

        return json({
          success: true,
          scheduled: isScheduled,
          scheduled_at: isScheduled ? new Date(scheduledMs).toISOString() : null,
          facebook_post_id: fbPostId,
          instagram_post_id: igPostId,
        });
      }

      /* ------------------------------ insights ------------------------------ */
      case "fetch_campaign_insights": {
        const { data: rows } = await db
          .from("social_campaigns")
          .select("id,external_id")
          .not("external_id", "is", null);
        const today = new Date().toISOString().slice(0, 10);
        for (const r of rows || []) {
          try {
            const res = await graph(`/${r.external_id}/insights`, {
              token: userToken,
              params: { fields: "reach,impressions,clicks,spend,actions,action_values", date_preset: "maximum" },
            });
            const d = res?.data?.[0];
            if (!d) continue;
            const actionCount = (t: string) =>
              Number((d.actions || []).find((a: any) => a.action_type === t)?.value || 0);
            const revenue = Number(
              (d.action_values || []).find((a: any) => a.action_type === "purchase")?.value || 0,
            );
            await db.from("social_insights").upsert({
              platform: "meta",
              entity_type: "campaign",
              entity_id: r.id,
              external_id: r.external_id,
              stat_date: today,
              reach: Number(d.reach || 0),
              impressions: Number(d.impressions || 0),
              clicks: Number(d.clicks || 0),
              spend: Number(d.spend || 0),
              leads: actionCount("lead"),
              purchases: actionCount("purchase"),
              conversions: actionCount("offsite_conversion"),
              revenue,
              raw: d,
            }, { onConflict: "entity_type,entity_id,stat_date" });
          } catch (e) {
            console.error("insights failed for", r.external_id, (e as Error).message);
          }
        }
        return json({ success: true });
      }

      /* ------------------------------ diagnostics ---------------------------- */
      case "diagnostic_account":
      case "diagnostic_campaigns":
      case "diagnostic_adsets":
      case "diagnostic_ads":
      case "diagnostic_creatives":
      case "diagnostic_insights": {
        const rawAcct = conn.default_ad_account_id;
        if (!rawAcct) return json({ error: "No Meta Ad Account is configured" }, 400);
        const adAccount = rawAcct.startsWith("act_") ? rawAcct : `act_${rawAcct}`;
        const category = action.replace("diagnostic_", "");
        const results = await runCategory(category, { token: userToken, adAccount });

        await db.from("meta_api_diagnostics").insert(
          results.map((r) => ({
            user_id: authUserId ?? null,
            connection_id: conn.id,
            ad_account_id: adAccount,
            test_category: r.category,
            test_name: r.name,
            http_method: r.http_method,
            endpoint: r.endpoint,
            status: r.status,
            http_status: r.http_status,
            meta_error_code: r.meta_error_code,
            meta_error_message: r.meta_error_message,
            duration_ms: r.duration_ms,
            records_returned: r.records_returned,
          })),
        );

        return json({ success: true, category, results });
      }

      case "diagnostic_lifecycle_run": {
        const rawAcct = conn.default_ad_account_id;
        if (!rawAcct) return json({ error: "No Meta Ad Account is configured" }, 400);
        const adAccount = rawAcct.startsWith("act_") ? rawAcct : `act_${rawAcct}`;
        const label = new Date().toISOString().slice(0, 10);
        const { steps, created } = await runLifecycle(
          { token: userToken, adAccount },
          { pageId: conn.default_page_id, label },
        );

        if (created.length) {
          await db.from("meta_api_diagnostic_test_objects").insert(
            created.map((c) => ({
              user_id: authUserId ?? null,
              connection_id: conn.id,
              ad_account_id: adAccount,
              object_type: c.object_type,
              external_id: c.external_id,
              name: c.name,
            })),
          );
        }

        await db.from("meta_api_diagnostics").insert(
          steps.map((s) => ({
            user_id: authUserId ?? null,
            connection_id: conn.id,
            ad_account_id: adAccount,
            test_category: "lifecycle",
            test_name: s.step,
            http_method: "POST",
            endpoint: "/lifecycle",
            status: s.status,
            http_status: s.status === "success" ? 200 : null,
            meta_error_message: s.message ?? null,
            duration_ms: s.duration_ms,
            records_returned: s.external_id ? 1 : 0,
          })),
        );

        return json({ success: true, steps });
      }

      case "diagnostic_lifecycle_cleanup": {
        const rawAcct = conn.default_ad_account_id;
        const adAccount = rawAcct?.startsWith("act_") ? rawAcct : rawAcct ? `act_${rawAcct}` : null;
        const { data: objects } = await db
          .from("meta_api_diagnostic_test_objects")
          .select("*")
          .is("cleaned_up_at", null)
          .eq("connection_id", conn.id);

        // delete leaf objects first so parents can be removed cleanly
        const order = ["ad", "adcreative", "adset", "campaign"];
        const sorted = [...(objects || [])].sort(
          (a, b) => order.indexOf(a.object_type) - order.indexOf(b.object_type),
        );

        const outcome: { external_id: string; object_type: string; status: string; message?: string }[] = [];
        for (const obj of sorted) {
          try {
            await cleanupObject({ token: userToken, adAccount: adAccount || "" }, obj.external_id);
            await db.from("meta_api_diagnostic_test_objects")
              .update({ cleaned_up_at: new Date().toISOString() }).eq("id", obj.id);
            outcome.push({ external_id: obj.external_id, object_type: obj.object_type, status: "deleted" });
          } catch (e) {
            outcome.push({
              external_id: obj.external_id,
              object_type: obj.object_type,
              status: "failed",
              message: (e as Error).message,
            });
          }
        }
        return json({ success: true, cleaned: outcome });
      }

      /* --------------------- campaign performance (ads_read) ------------------ */
      case "campaign_performance": {
        const { data: c } = await db
          .from("social_campaigns")
          .select("id,name,external_id,status,start_date,end_date")
          .eq("id", payload.campaign_id)
          .maybeSingle();
        if (!c) throw new Error("Campaign not found");
        if (!c.external_id) return json({ error: "This campaign has not been published to Meta yet" }, 400);

        const preset = typeof payload.date_preset === "string" ? payload.date_preset : "maximum";
        const insightFields =
          "impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,spend,frequency,actions,date_start,date_stop";

        const meta = await graph(`/${c.external_id}`, {
          token: userToken,
          params: {
            fields:
              "id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,created_time,start_time,stop_time,updated_time",
          },
        });

        const totalsRes = await graph(`/${c.external_id}/insights`, {
          token: userToken,
          params: { fields: insightFields, date_preset: preset },
        });
        const totals = totalsRes?.data?.[0] || null;

        let daily: any[] = [];
        try {
          const d = await graph(`/${c.external_id}/insights`, {
            token: userToken,
            params: { fields: insightFields, date_preset: preset, time_increment: "1" },
          });
          daily = d?.data || [];
        } catch (_) { /* breakdown optional */ }

        let ads: any[] = [];
        try {
          const a = await graph(`/${c.external_id}/insights`, {
            token: userToken,
            params: { fields: insightFields + ",ad_id,ad_name,adset_name", date_preset: preset, level: "ad" },
          });
          ads = a?.data || [];
        } catch (_) { /* breakdown optional */ }

        return json({
          success: true,
          campaign: { ...c, meta },
          totals,
          daily,
          ads,
        });
      }

      /* ------------------------ ad performance (ads_read) ------------------- */
      case "ad_performance": {
        const { data: ad } = await db
          .from("social_ads")
          .select("id,name,external_id,status,lead_form_id")
          .eq("id", payload.ad_id)
          .maybeSingle();
        if (!ad) throw new Error("Ad not found");
        if (!ad.external_id) return json({ error: "This ad has not been published to Meta yet" }, 400);

        const preset = typeof payload.date_preset === "string" ? payload.date_preset : "maximum";
        const insightFields =
          "impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,spend,frequency,actions,date_start,date_stop";

        const meta = await graph(`/${ad.external_id}`, {
          token: userToken,
          params: { fields: "id,name,status,effective_status,created_time,updated_time" },
        });

        const totalsRes = await graph(`/${ad.external_id}/insights`, {
          token: userToken,
          params: { fields: insightFields, date_preset: preset },
        });
        const totals = totalsRes?.data?.[0] || null;

        let daily: any[] = [];
        try {
          const d = await graph(`/${ad.external_id}/insights`, {
            token: userToken,
            params: { fields: insightFields, date_preset: preset, time_increment: "1" },
          });
          daily = d?.data || [];
        } catch (_) { /* breakdown optional */ }

        return json({
          success: true,
          ad: { ...ad, meta },
          totals,
          daily,
        });
      }

      /* ------------------------ import from Meta ---------------------------- */
      case "import_from_meta": {
        const { data: accounts } = await db
          .from("social_ad_accounts")
          .select("ad_account_id")
          .eq("connection_id", conn.id);
        const accountIds = (accounts || []).map((a: any) => String(a.ad_account_id || "")).filter(Boolean);
        if (!accountIds.length) {
          return json({ error: "No ad accounts are linked to this Meta account. Reconnect Meta and try again." }, 400);
        }

        const now = new Date().toISOString();
        let campaigns = 0, adSets = 0, ads = 0;

        for (const raw of accountIds) {
          const acct = raw.startsWith("act_") ? raw : `act_${raw}`;

          const metaCampaigns = await graphAll(
            `/${acct}/campaigns`,
            userToken,
            "id,name,objective,buying_type,status,effective_status,daily_budget,lifetime_budget,bid_strategy,spend_cap,start_time,stop_time,special_ad_categories,special_ad_category_country",
          );

          for (const mc of metaCampaigns) {
            const campaignFields: Record<string, unknown> = {
              platform: "meta",
              connection_id: conn.id,
              ad_account_id: acct,
              name: String(mc.name ?? "Untitled campaign"),
              objective: reverseObjective(mc.objective),
              buying_type: String(mc.buying_type) === "RESERVED" ? "reach_and_frequency" : "auction",
              ...moneyToLocal(mc.daily_budget, mc.lifetime_budget),
              status: localStatus(mc.effective_status || mc.status),
              special_ad_categories: (mc.special_ad_categories || [])
                .map((s: string) => reverseSpecialCategory(s))
                .filter(Boolean),
              start_date: mc.start_time || null,
              end_date: mc.stop_time || null,
              bid_strategy: mc.bid_strategy ? String(mc.bid_strategy) : null,
              spend_cap: mc.spend_cap ? Number(mc.spend_cap) / 100 : null,
              special_ad_category_country: Array.isArray(mc.special_ad_category_country) && mc.special_ad_category_country.length ? mc.special_ad_category_country : null,
              meta_effective_status: mc.effective_status ? String(mc.effective_status).toUpperCase() : null,
              external_id: String(mc.id),
              last_synced_at: now,
            };

            const { data: existingCamp } = await db
              .from("social_campaigns")
              .select("id")
              .eq("external_id", String(mc.id))
              .maybeSingle();

            let localCampaignId: string | null = existingCamp?.id ?? null;
            if (localCampaignId) {
              const { error } = await db.from("social_campaigns").update(campaignFields).eq("id", localCampaignId);
              if (error) throw new Error(`Could not save campaign "${mc.name}": ${error.message}`);
            } else {
              const { data: inserted, error } = await db
                .from("social_campaigns")
                .insert(campaignFields)
                .select("id")
                .single();
              if (error) throw new Error(`Could not save campaign "${mc.name}": ${error.message}`);
              localCampaignId = inserted.id;
            }
            campaigns++;

            const metaAdSets = await graphAll(
              `/${mc.id}/adsets`,
              userToken,
              "id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,bid_amount,start_time,end_time,targeting",
            );

            for (const ms of metaAdSets) {
              const adSetFields: Record<string, unknown> = {
                platform: "meta",
                campaign_id: localCampaignId,
                name: String(ms.name ?? "Untitled ad set"),
                ...moneyToLocal(ms.daily_budget, ms.lifetime_budget, true),
                optimization_goal: ms.optimization_goal || null,
                billing_event: ms.billing_event || null,
                bid_strategy: ms.bid_strategy || null,
                bid_amount: ms.bid_amount ? Number(ms.bid_amount) / 100 : null,
                start_at: ms.start_time || null,
                end_at: ms.end_time || null,
                status: localStatus(ms.effective_status || ms.status),
                external_id: String(ms.id),
                last_synced_at: now,
              };

              const { data: existingSet } = await db
                .from("social_ad_sets")
                .select("id")
                .eq("external_id", String(ms.id))
                .maybeSingle();

              let localAdSetId: string | null = existingSet?.id ?? null;
              if (localAdSetId) {
                const { error } = await db.from("social_ad_sets").update(adSetFields).eq("id", localAdSetId);
                if (error) throw new Error(`Could not save ad set "${ms.name}": ${error.message}`);
              } else {
                // Keep a link to a customer list we created, if Meta reports one.
                const metaAudienceId = ms.targeting?.custom_audiences?.[0]?.id
                  ? String(ms.targeting.custom_audiences[0].id)
                  : null;
                let customAudienceId: string | null = null;
                if (metaAudienceId) {
                  const { data: knownAudience } = await db
                    .from("social_custom_audiences")
                    .select("id")
                    .eq("external_id", metaAudienceId)
                    .maybeSingle();
                  customAudienceId = knownAudience?.id ?? null;
                }
                const { data: inserted, error } = await db
                  .from("social_ad_sets")
                  .insert({
                    ...adSetFields,
                    placements: metaToPlacements(ms.targeting),
                    targeting: readTargeting(ms.targeting),
                    custom_audience_id: customAudienceId,
                    published_at: now,
                  })
                  .select("id")
                  .single();
                if (error) throw new Error(`Could not save ad set "${ms.name}": ${error.message}`);
                localAdSetId = inserted.id;
              }
              adSets++;

              const metaAds = await graphAll(
                `/${ms.id}/ads`,
                userToken,
                "id,name,status,effective_status,creative{id,title,body,thumbnail_url}",
              );

              for (const ma of metaAds) {
                const adFields: Record<string, unknown> = {
                  platform: "meta",
                  ad_set_id: localAdSetId,
                  name: String(ma.name ?? "Untitled ad"),
                  status: localStatus(ma.effective_status || ma.status),
                  external_id: String(ma.id),
                  creative_external_id: ma.creative?.id ? String(ma.creative.id) : null,
                };

                const { data: existingAd } = await db
                  .from("social_ads")
                  .select("id")
                  .eq("external_id", String(ma.id))
                  .maybeSingle();

                if (existingAd?.id) {
                  // Only refresh what Meta owns; local creative edits are preserved.
                  const { error } = await db.from("social_ads").update(adFields).eq("id", existingAd.id);
                  if (error) throw new Error(`Could not save ad "${ma.name}": ${error.message}`);
                } else {
                  const { error } = await db.from("social_ads").insert({
                    ...adFields,
                    creative_type: "link",
                    media: ma.creative?.thumbnail_url ? { url: ma.creative.thumbnail_url } : {},
                    headline: ma.creative?.title || null,
                    primary_text: ma.creative?.body || null,
                  });
                  if (error) throw new Error(`Could not save ad "${ma.name}": ${error.message}`);
                }
                ads++;
              }
            }
          }
        }

        return json({ success: true, campaigns, ad_sets: adSets, ads });
      }

      case "resync_accounts": {
        return json({ success: true, note: "Reconnect via Facebook to refresh pages and ad accounts" });
      }

      /* ------------------------------ locations ------------------------------ */
      case "search_geo": {
        const q = String(payload.q ?? "").trim();
        if (q.length < 2) return json({ success: true, results: [] });
        const allowed = ["country", "region", "city"];
        const types = Array.isArray(payload.types) ? payload.types.map(String).filter((t: string) => allowed.includes(t)) : allowed;
        const res = await step("Search locations on Meta", () => graph(`/search`, {
          token: userToken,
          params: { type: "adgeolocation", q, location_types: JSON.stringify(types.length ? types : allowed), limit: "15" },
        }));
        const results = (res?.data || []).map((r: any) => ({
          key: String(r.key), name: String(r.name), type: String(r.type),
          country_code: r.country_code ? String(r.country_code) : undefined,
          country_name: r.country_name ? String(r.country_name) : undefined,
          region: r.region ? String(r.region) : undefined,
        }));
        return json({ success: true, results });
      }

      /* ------------------------------ billing ------------------------------ */
      case "billing_status": {
        const adAccount = normalizeActId(payload.ad_account_id || conn.default_ad_account_id);
        if (!adAccount) return json({ error: "No Meta Ad Account is configured. Choose a default Ad Account first." }, 400);
        const res = await step("Read ad account billing", () => graph(`/${adAccount}`, {
          token: userToken, params: { fields: BILLING_FIELDS },
        }));
        const account = readBillingAccount(res, adAccount);
        // Keep the stored status current (Diagnostics reads it); ignore failures.
        if (account.account_status !== null) {
          const bare = adAccount.replace(/^act_/, "");
          await db.from("social_ad_accounts")
            .update({ account_status: String(account.account_status) })
            .eq("connection_id", conn.id)
            .in("ad_account_id", [adAccount, bare]);
        }
        return json({ success: true, account, ...metaBillingUrls(adAccount) });
      }

      /* --------------------------- publishing check -------------------------- */
      // Read-only. Confirms WHO the saved login is, what it may do, and whether
      // Meta is holding anything against it. Never writes to Meta.
      case "publishing_check": {
        const checks: {
          label: string;
          status: "ok" | "warn" | "fail";
          detail: string;
        }[] = [];
        const add = (label: string, status: "ok" | "warn" | "fail", detail: string) =>
          checks.push({ label, status, detail });

        let me: any = null;
        try {
          me = await graph("/me", { token: userToken, params: { fields: "id,name" } });
          add("Meta person behind the app's login", "ok", `${me.name} (ID ${me.id})`);
        } catch (e) {
          add("Meta person behind the app's login", "fail", (e as Error).message);
        }

        if (me?.id && conn.external_user_id) {
          const same = String(me.id) === String(conn.external_user_id);
          add(
            "Saved login still matches the live token",
            same ? "ok" : "fail",
            same
              ? "The stored account and the live token are the same person."
              : `Stored as ${conn.external_user_name} (${conn.external_user_id}) but the token belongs to ${me.name} (${me.id}). Reconnect Meta.`,
          );
        }

        try {
          const perms = await graph("/me/permissions", { token: userToken });
          const granted = (perms?.data || [])
            .filter((p: any) => p.status === "granted")
            .map((p: any) => p.permission);
          const required = ["ads_management", "ads_read", "pages_show_list", "business_management"];
          const missing = required.filter((r) => !granted.includes(r));
          add(
            "Permissions granted to the app",
            missing.length ? "warn" : "ok",
            missing.length ? `Missing: ${missing.join(", ")}. Granted: ${granted.join(", ") || "none"}`
              : `Granted: ${granted.join(", ")}`,
          );
        } catch (e) {
          add("Permissions granted to the app", "fail", (e as Error).message);
        }

        const { data: accounts } = await db
          .from("social_ad_accounts")
          .select("ad_account_id,name")
          .eq("connection_id", conn.id);

        for (const a of accounts || []) {
          const acct = String(a.ad_account_id).startsWith("act_") ? a.ad_account_id : `act_${a.ad_account_id}`;
          try {
            const info = await graph(`/${acct}`, {
              token: userToken,
              params: { fields: "name,account_status,disable_reason,business,user_tasks" },
            });
            const tasks: string[] = info.user_tasks || [];
            const canManage = tasks.includes("MANAGE") || tasks.includes("ADVERTISE");
            const healthy = Number(info.account_status) === 1;
            add(
              `Ad account: ${info.name || a.name}`,
              healthy && canManage ? "ok" : "warn",
              `Status ${info.account_status}${info.disable_reason ? ` (reason ${info.disable_reason})` : ""}` +
                `; your role allows: ${tasks.length ? tasks.join(", ") : "no listed tasks"}` +
                `${info.business?.name ? `; business ${info.business.name}` : ""}`,
            );
          } catch (e) {
            add(`Ad account: ${a.name || a.ad_account_id}`, "fail", (e as Error).message);
          }
        }

        try {
          const pages = await graph("/me/accounts", { token: userToken, params: { fields: "id,name,tasks", limit: "50" } });
          for (const p of pages?.data || []) {
            const tasks: string[] = p.tasks || [];
            const canAdvertise = tasks.includes("ADVERTISE") || tasks.includes("MANAGE");
            add(
              `Facebook Page: ${p.name}`,
              canAdvertise ? "ok" : "warn",
              `Your role allows: ${tasks.length ? tasks.join(", ") : "no listed tasks"}` +
                `${String(p.id) === String(conn.default_page_id) ? " (used for ads)" : ""}`,
            );
          }
        } catch (e) {
          add("Facebook Pages", "fail", (e as Error).message);
        }

        // Probe whether Meta is currently holding a pending action against ad writes.
        const probeAcct = conn.default_ad_account_id
          ? (String(conn.default_ad_account_id).startsWith("act_")
            ? conn.default_ad_account_id
            : `act_${conn.default_ad_account_id}`)
          : null;
        if (probeAcct) {
          try {
            await graph(`/${probeAcct}/adcreatives`, { token: userToken, params: { fields: "id", limit: "1" } });
            add("Meta pending action on this login", "ok", "No security hold was reported while reading ad creatives.");
          } catch (e) {
            const msg = (e as Error).message;
            const held = /pending action|authenticate your account|requires the user to take/i.test(msg);
            add(
              "Meta pending action on this login",
              held ? "fail" : "warn",
              held
                ? "Meta is holding a security check against this login. It must be cleared in Ads Manager (Account Quality > confirm identity)."
                : msg,
            );
          }
        }

        return json({ success: true, checks });
      }





      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    const e = err as Error & { metaStep?: string; metaCode?: unknown; metaSubcode?: unknown; fbtraceId?: unknown };
    const raw = e.message || "Unexpected error";
    console.error("meta-api error:", raw, JSON.stringify({
      step: e.metaStep ?? null, code: e.metaCode ?? null, subcode: e.metaSubcode ?? null, fbtrace_id: e.fbtraceId ?? null,
    }));

    const meta = {
      step: e.metaStep ?? null,
      meta_code: e.metaCode ?? null,
      meta_subcode: e.metaSubcode ?? null,
      fbtrace_id: e.fbtraceId ?? null,
    };

    // Customer-list audiences need the ad account's Custom Audience Terms accepted once.
    if (isCustomAudienceTermsError(e)) {
      const account = errorAdAccount;
      return json({
        error:
          "Meta requires you to accept the Custom Audience Terms for this ad account before customer lists can be used. " +
          `Open ${customAudienceTermsUrl(account || "act_")} as an admin of the ad account, accept the terms, then try again.` +
          (e.metaStep ? ` (blocked at: ${e.metaStep})` : ""),
        code: "meta_custom_audience_terms_required",
        terms_url: customAudienceTermsUrl(account || "act_"),
        ...meta,
      }, 409);
    }

    // Meta blocks all ad create/edit calls until the user verifies their account
    // in Ads Manager. Nothing here can bypass it — surface clear guidance instead
    // of a raw 500 so the screen doesn't break.
    if (/pending action|authenticate your account|requires the user to take/i.test(raw)) {
      return json({
        error:
          "Meta has put a security hold on your ad account. Open Facebook Ads Manager, complete the " +
          "\"Please authenticate your account\" prompt (Account Quality > confirm identity), then try publishing again. " +
          "Ads already running are unaffected." +
          (e.metaStep ? ` (blocked at: ${e.metaStep})` : ""),
        code: "meta_account_verification_required",
        ...meta,
      }, 409);
    }

    // The saved Meta login was granted without the marketing permissions the app
    // needs. Nothing can read or publish ads until the user reconnects with them.
    if (
      (e as { httpStatus?: number }).httpStatus === 403 ||
      /has NOT grant ads_management or ads_read|requires.*ads_management|Ads access/i.test(raw)
    ) {
      return json({
        error:
          "Your Meta login hasn't granted the ad permissions this app needs. " +
          "Disconnect and reconnect Meta in Communications Center > Meta Connection, and tick every permission on the Facebook consent screen " +
          "(especially 'Access the Ads API' / ads_management and ads_read), then try again." +
          (e.metaStep ? ` (blocked at: ${e.metaStep})` : ""),
        code: "meta_permission_missing",
        ...meta,
      }, 403);
    }

    return json({ error: raw, ...meta }, 500);

  }

});