// Lead ads helpers, written against Meta's "Lead Forms for Ads" guide
// (POST /{page-id}/leadgen_forms, link_data.call_to_action.value.lead_gen_form_id).
// Pure functions so they can be unit-tested; the meta-api function does the Graph calls.

/** Question types documented for POST /{page-id}/leadgen_forms. */
export const LEAD_QUESTION_TYPES = [
  "FULL_NAME", "EMAIL", "PHONE", "FIRST_NAME", "LAST_NAME", "CUSTOM", "DATE_TIME",
  "ID_AR_DNI", "ID_CPF", "ID_CL_RUT", "ID_CO_CC", "ID_EC_CI", "ID_PE_DNI", "STORE_LOOKUP",
] as const;
export type LeadQuestionType = typeof LEAD_QUESTION_TYPES[number];

/** Call-to-action types Meta lists for lead ad creatives. */
export const LEAD_CTA_TYPES = ["APPLY_NOW", "DOWNLOAD", "GET_QUOTE", "LEARN_MORE", "SIGN_UP", "SUBSCRIBE"] as const;

export const LEAD_LOCALES = ["EN_US", "EN_GB", "HI_IN"] as const;
export const THANK_YOU_BUTTON_TYPES = ["VIEW_WEBSITE", "CALL_BUSINESS"] as const;
export const CONTEXT_CARD_STYLES = ["LIST_STYLE", "PARAGRAPH_STYLE"] as const;

export interface LeadQuestionInput {
  type: string;
  key?: string;
  label?: string;
  options?: Array<{ value: string; key?: string }>;
}

export interface LeadFormInput {
  name: string;
  questions: LeadQuestionInput[];
  privacy_policy: { url: string; link_text?: string };
  follow_up_action_url?: string;
  thank_you_page?: {
    title: string;
    body?: string;
    button_type: string;
    button_text?: string;
    website_url?: string;
    business_phone_number?: string;
    country_code?: string;
  };
  context_card?: { title?: string; content?: string[]; style?: string; button_text?: string };
  locale?: string;
  question_page_custom_headline?: string;
  is_optimized_for_quality?: boolean;
  block_display_for_non_targeted_viewer?: boolean;
}

const slug = (s: string) =>
  String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "q";

const isHttpUrl = (u: unknown) => typeof u === "string" && /^https?:\/\/[^\s]+$/i.test(u.trim());
const isHttpsUrl = (u: unknown) => typeof u === "string" && /^https:\/\/[^\s]+$/i.test(u.trim());

/** Validates a form; returns human-readable problems (empty when valid). */
export function validateLeadForm(input: LeadFormInput): string[] {
  const errors: string[] = [];
  if (!String(input?.name || "").trim()) errors.push("Form name is required");
  const qs = Array.isArray(input?.questions) ? input.questions : [];
  if (qs.length === 0) errors.push("Add at least one question");
  const keys = new Set<string>();
  qs.forEach((q, i) => {
    const n = i + 1;
    if (!LEAD_QUESTION_TYPES.includes(q.type as LeadQuestionType)) errors.push(`Question ${n}: unsupported type "${q.type}"`);
    const key = q.key || (q.type === "CUSTOM" ? slug(q.label || "") : q.type.toLowerCase());
    if (keys.has(key)) errors.push(`Question ${n}: duplicate key "${key}"`);
    keys.add(key);
    if (q.type === "CUSTOM") {
      if (!String(q.label || "").trim()) errors.push(`Question ${n}: custom questions need a label`);
      if (q.options !== undefined) {
        const opts = (q.options || []).filter((o) => String(o?.value || "").trim());
        if (opts.length < 2) errors.push(`Question ${n}: multiple-choice questions need at least 2 options`);
      }
    }
  });
  if (!isHttpsUrl(input?.privacy_policy?.url)) errors.push("Privacy policy URL is required and must start with https://");
  if (input?.follow_up_action_url && !isHttpUrl(input.follow_up_action_url)) errors.push("Follow-up URL must be a valid http(s) URL");
  const ty = input?.thank_you_page;
  if (ty) {
    if (!String(ty.title || "").trim()) errors.push("Thank-you page: title is required");
    if (!THANK_YOU_BUTTON_TYPES.includes(ty.button_type as typeof THANK_YOU_BUTTON_TYPES[number])) errors.push("Thank-you page: button type must be VIEW_WEBSITE or CALL_BUSINESS");
    if (ty.button_type === "VIEW_WEBSITE" && !isHttpUrl(ty.website_url)) errors.push("Thank-you page: website URL is required for View website");
    if (ty.button_type === "CALL_BUSINESS" && (!String(ty.business_phone_number || "").trim() || !String(ty.country_code || "").trim())) {
      errors.push("Thank-you page: phone number and country code are required for Call business");
    }
  }
  if (input?.context_card?.style && !CONTEXT_CARD_STYLES.includes(input.context_card.style as typeof CONTEXT_CARD_STYLES[number])) errors.push("Intro card style must be LIST_STYLE or PARAGRAPH_STYLE");
  if (input?.locale && !LEAD_LOCALES.includes(input.locale as typeof LEAD_LOCALES[number])) errors.push(`Locale "${input.locale}" is not offered`);
  return errors;
}

/** Exact request body for POST /{page-id}/leadgen_forms (documented parameter names only). */
export function buildLeadFormPayload(input: LeadFormInput): Record<string, unknown> {
  const questions = (input.questions || []).map((q) => {
    const out: Record<string, unknown> = { type: q.type };
    out.key = q.key || (q.type === "CUSTOM" ? slug(q.label || "") : q.type.toLowerCase());
    if (q.type === "CUSTOM") {
      out.label = String(q.label || "").trim();
      if (q.options !== undefined) {
        out.options = (q.options || [])
          .filter((o) => String(o?.value || "").trim())
          .map((o) => ({ value: String(o.value).trim(), key: o.key || slug(o.value) }));
      }
    } else if (q.label) {
      out.label = String(q.label).trim();
    }
    return out;
  });
  const payload: Record<string, unknown> = {
    name: String(input.name).trim(),
    questions,
    privacy_policy: {
      url: String(input.privacy_policy.url).trim(),
      link_text: String(input.privacy_policy.link_text || "Privacy Policy").trim(),
    },
  };
  if (input.follow_up_action_url) payload.follow_up_action_url = String(input.follow_up_action_url).trim();
  if (input.thank_you_page) {
    const ty = input.thank_you_page;
    const t: Record<string, unknown> = { title: String(ty.title).trim(), button_type: ty.button_type };
    if (ty.body) t.body = String(ty.body).trim();
    if (ty.button_text) t.button_text = String(ty.button_text).trim();
    if (ty.button_type === "VIEW_WEBSITE") t.website_url = String(ty.website_url).trim();
    if (ty.button_type === "CALL_BUSINESS") {
      t.business_phone_number = String(ty.business_phone_number).trim();
      t.country_code = String(ty.country_code).trim().toUpperCase();
    }
    payload.thank_you_page = t;
  }
  if (input.context_card && (input.context_card.title || (input.context_card.content || []).length)) {
    const cc: Record<string, unknown> = {};
    if (input.context_card.title) cc.title = String(input.context_card.title).trim();
    const content = (input.context_card.content || []).map((c) => String(c).trim()).filter(Boolean);
    if (content.length) cc.content = content;
    cc.style = input.context_card.style || "LIST_STYLE";
    if (input.context_card.button_text) cc.button_text = String(input.context_card.button_text).trim();
    payload.context_card = cc;
  }
  payload.locale = input.locale || "EN_US";
  if (input.question_page_custom_headline) payload.question_page_custom_headline = String(input.question_page_custom_headline).trim();
  if (input.is_optimized_for_quality) payload.is_optimized_for_quality = true;
  if (input.block_display_for_non_targeted_viewer !== undefined) payload.block_display_for_non_targeted_viewer = !!input.block_display_for_non_targeted_viewer;
  return payload;
}

/** Ad-set fields Meta requires for lead campaigns (objective OUTCOME_LEADS). */
export function leadAdSetFields(optimizationGoal: unknown, pageId: string): Record<string, unknown> {
  const goal = optimizationGoal === "QUALITY_LEAD" ? "QUALITY_LEAD" : "LEAD_GENERATION";
  return {
    optimization_goal: goal,
    billing_event: "IMPRESSIONS",
    destination_type: "ON_AD",
    promoted_object: { page_id: String(pageId) },
  };
}

export interface LeadCreativeSource {
  name: string;
  primary_text?: string | null;
  headline?: string | null;
  description?: string | null;
  call_to_action?: string | null;
  media?: { kind?: string; url?: string; video_id?: string; video_status?: string; thumbnail_url?: string } | null;
}

/**
 * object_story_spec for a lead ad, per the guide: link_data with link "https://fb.me/",
 * image_hash and call_to_action.value.lead_gen_form_id; video ads use video_data with
 * video_id, image_url, link_description and the same CTA.
 */
export function buildLeadObjectStorySpec(ad: LeadCreativeSource, pageId: string, leadFormId: string, imageHash: string | null): Record<string, unknown> {
  if (!leadFormId) throw new Error("Choose or create a lead form on this ad before publishing.");
  const ctaType = String(ad.call_to_action || "");
  if (!LEAD_CTA_TYPES.includes(ctaType as typeof LEAD_CTA_TYPES[number])) {
    throw new Error(`Lead ads need a call to action of ${LEAD_CTA_TYPES.join(", ")}. "${ctaType || "none"}" is not allowed.`);
  }
  const call_to_action = { type: ctaType, value: { lead_gen_form_id: String(leadFormId) } };
  const media = ad.media || null;
  if (media?.kind === "video") {
    if (!media.video_id) throw new Error("The video has not been registered on Meta yet. Open the ad, wait for the video to show Ready, then publish.");
    if (media.video_status !== "ready") throw new Error("The video is still processing on Meta. Try again in a minute.");
    if (!media.thumbnail_url) throw new Error("Lead video ads need a thumbnail image (image_url). Re-upload the video so a thumbnail is captured.");
    return {
      page_id: pageId,
      video_data: {
        video_id: media.video_id,
        image_url: media.thumbnail_url,
        title: ad.headline || ad.name,
        message: ad.primary_text || "",
        link_description: ad.description || "",
        call_to_action,
      },
    };
  }
  if (!imageHash) throw new Error("Lead ads need an image (uploaded to Meta as image_hash) or a video.");
  return {
    page_id: pageId,
    link_data: {
      link: "https://fb.me/",
      message: ad.primary_text || "",
      name: ad.headline || ad.name,
      description: ad.description || "",
      image_hash: imageHash,
      call_to_action,
    },
  };
}

/**
 * Pre-flight for publishing a lead ad set. Returns a user-facing problem naming the exact Page
 * and missing item, or null when both the token permission and the Page's Lead Ads Terms are fine.
 * `granted` = null means the permission list could not be read (do not block on it).
 */
export function leadPreflightProblem(args: { granted: string[] | null; tosAccepted: boolean | null | undefined; pageId: string; pageName?: string | null }): string | null {
  const page = `Page "${args.pageName || "unknown"}" (${args.pageId})`;
  if (args.granted && !args.granted.includes("pages_manage_ads")) {
    return "Reconnect Meta (Communication Center → Meta → Connect with Facebook) so the app receives the pages_manage_ads permission; the current connection was made before that permission was requested. Lead ad sets cannot be created without it.";
  }
  if (args.tosAccepted === false) {
    return `${page} has not accepted Meta's Lead Ads Terms. A Page admin must accept them at https://www.facebook.com/ads/leadgen/tos (choose this Page in the selector), then publish again.`;
  }
  return null;
}

export const AD_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/** Guards the image we are about to send as `bytes` to POST /act_{id}/adimages. */
export function assertUploadableImage(contentType: string | null | undefined, size: number): void {
  const ct = String(contentType || "").toLowerCase();
  if (!ct.startsWith("image/")) throw new Error(`The ad media is not an image (content type "${ct || "unknown"}"). Upload a JPG or PNG.`);
  if (!Number.isFinite(size) || size <= 0) throw new Error("The ad image could not be downloaded (empty file).");
  if (size > AD_IMAGE_MAX_BYTES) throw new Error(`The ad image is ${(size / 1024 / 1024).toFixed(1)} MB; Meta ad images must be 8 MB or smaller.`);
}

/** POST /adimages answers `{ images: { "<filename>": { hash, url, … } } }`; returns the first hash. */
export function pickImageHash(res: unknown): string | null {
  const images = (res as { images?: Record<string, { hash?: unknown }> } | null)?.images;
  if (!images || typeof images !== "object") return null;
  for (const v of Object.values(images)) {
    if (v && typeof v.hash === "string" && v.hash) return v.hash;
  }
  return null;
}

/** Maps a Meta lead's field_data onto the app's leads table columns. */
export function mapLeadFieldData(fieldData: Array<{ name?: string; values?: unknown[] }> | undefined) {
  const get = (...names: string[]) => {
    for (const n of names) {
      const f = (fieldData || []).find((x) => String(x.name || "").toLowerCase() === n);
      const v = f?.values?.[0];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return "";
  };
  const first = get("first_name");
  const last = get("last_name");
  const name = get("full_name") || [first, last].filter(Boolean).join(" ") || "";
  const phone = get("phone_number", "phone");
  const email = get("email");
  const custom: Record<string, string> = {};
  for (const f of fieldData || []) {
    const n = String(f.name || "");
    if (!["full_name", "first_name", "last_name", "email", "phone_number", "phone"].includes(n.toLowerCase()) && f.values?.length) {
      custom[n] = String(f.values[0]);
    }
  }
  return { name, email, phone, custom };
}

/* ------------------------- Saving submissions as CRM leads ------------------------- */

/** Last 10 digits of a phone, so "+91 98765 43210" and "9876543210" compare equal. */
export function phoneMatchKey(phone: unknown): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export interface LeadInsert {
  name: string;
  email: string | null;
  phone: string;
  city: string | null;
  source: "Meta Lead Ad";
  interest: string;
}

/**
 * Builds the `leads` row for a Meta instant-form submission, or null when the form gave no
 * phone (leads.phone is NOT NULL). `interest` is "Meta - <ad name>" as the user asked.
 */
export function leadInsertFromSubmission(
  fieldData: Array<{ name?: string; values?: unknown[] }> | undefined,
  adName: string,
): LeadInsert | null {
  const m = mapLeadFieldData(fieldData);
  const phone = m.phone.replace(/\s+/g, "");
  if (!phone) return null;
  const cityKey = Object.keys(m.custom).find((k) => k.toLowerCase() === "city");
  return {
    name: m.name || m.email || phone,
    email: m.email || null,
    phone,
    city: cityKey ? m.custom[cityKey] || null : null,
    source: "Meta Lead Ad",
    interest: `Meta - ${String(adName || "").trim() || "Lead ad"}`,
  };
}
