export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const META_SCOPES = [
  "public_profile",
  "email",
  "pages_show_list",
  "pages_manage_posts",
  "pages_read_engagement",
  "pages_manage_engagement",
  "ads_management",
  "ads_read",
  "business_management",
  // Lead ads: create instant forms on a Page and read the leads they collect
  // (Meta: "You must include the leads_retrieval and pages_manage_ads permissions").
  "pages_manage_ads",
  "leads_retrieval",
  // NOT requested: instagram_basic / instagram_content_publish. They need the Instagram
  // product on the Meta app (otherwise the login dialog says "Invalid Scopes") and only
  // serve organic posting from a *professional* Instagram account. The Instagram identity
  // of an ad comes from the ad account instead (see withInstagramIdentity) and needs no
  // extra scope.
];

export async function graph(
  path: string,
  opts: { token: string; method?: string; params?: Record<string, string>; body?: Record<string, unknown> } ,
) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  for (const [k, v] of Object.entries(opts.params || {})) url.searchParams.set(k, v);
  url.searchParams.set("access_token", opts.token);

  const init: RequestInit = { method: opts.method || "GET" };
  if (opts.body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url.toString(), init);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok || json?.error) {
    const e = json?.error || {};
    const detail = [e.error_user_title, e.error_user_msg, e.error_data && JSON.stringify(e.error_data)]
      .filter(Boolean)
      .join(" — ");
    const msg = e.message || text;
    const trace = [
      e.code != null ? `code ${e.code}` : null,
      e.error_subcode != null ? `subcode ${e.error_subcode}` : null,
      e.fbtrace_id ? `trace ${e.fbtrace_id}` : null,
    ].filter(Boolean).join(", ");
    const err = new Error(
      `[Meta ${res.status}] ${msg}${detail ? ` — ${detail}` : ""}${trace ? ` (${trace})` : ""}`,
    ) as Error & { metaCode?: unknown; metaSubcode?: unknown; fbtraceId?: unknown; httpStatus?: number };
    err.metaCode = e.code ?? null;
    err.metaSubcode = e.error_subcode ?? null;
    err.fbtraceId = e.fbtrace_id ?? null;
    err.httpStatus = res.status;
    throw err;
  }

  return json;
}

/* ------------------------------ Instagram on a Page ------------------------------ */

/**
 * Page fields that reveal the linked Instagram professional account.
 * - instagram_business_account: "Instagram account linked to page during Instagram business conversion flow"
 * - connected_instagram_account: "Instagram account connected to page via page settings"
 * Both need instagram_basic + pages_show_list on the token (Meta Page reference).
 */
export const INSTAGRAM_PAGE_FIELDS = "instagram_business_account{id,username},connected_instagram_account{id,username}";

/** Permissions the Instagram features need; reported back when missing. */
export const INSTAGRAM_PERMISSIONS = ["instagram_basic", "instagram_content_publish", "pages_show_list", "pages_read_engagement"];

export type InstagramAccount = { id: string; username: string | null };

/** Pick the Instagram account out of a Page read, preferring the business-linked one. */
export function pickInstagramAccount(page: unknown): InstagramAccount | null {
  const p = (page ?? {}) as Record<string, { id?: unknown; username?: unknown } | undefined>;
  const cand = p.instagram_business_account ?? p.connected_instagram_account;
  if (!cand || !cand.id) return null;
  return { id: String(cand.id), username: cand.username ? String(cand.username) : null };
}

/**
 * Resolve the Instagram account linked to a Page. Meta documents a User access token
 * for these fields, so that is tried first; the Page token is the fallback.
 * The last Meta error is returned instead of being swallowed, so the UI can show why
 * a Page has no Instagram account (typically a missing instagram_basic permission).
 */
export async function resolveInstagramAccount(
  pageId: string,
  tokens: { user: string; page?: string | null },
): Promise<{ account: InstagramAccount | null; error: string | null }> {
  const tried = Array.from(new Set([tokens.user, tokens.page].filter((t): t is string => !!t)));
  let lastError: string | null = null;
  for (const token of tried) {
    try {
      const res = await graph(`/${pageId}`, { token, params: { fields: INSTAGRAM_PAGE_FIELDS } });
      return { account: pickInstagramAccount(res), error: null };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  return { account: null, error: lastError };
}

/* ------------------------------ Instagram identity for ads ------------------------------ */

/**
 * Ads Manager "Identity → Instagram profile". The usable accounts are listed by
 * GET /act_{ad-account-id}/instagram_accounts (any account attached to the ad account or
 * business, professional or not) and chosen on the creative with
 * object_story_spec.instagram_user_id. instagram_actor_id is deprecated (v22.0 changelog,
 * all versions since 9 Sep 2025). Without an id Meta uses the Page-backed Instagram account.
 */
export function withInstagramIdentity(spec: Record<string, unknown>, instagramUserId: string | null | undefined): Record<string, unknown> {
  const id = String(instagramUserId ?? "").trim();
  if (!id) return spec;
  return { ...spec, instagram_user_id: id };
}

export type AdInstagramAccount = { ad_account_id: string; id: string; username: string | null; profile_pic: string | null };
