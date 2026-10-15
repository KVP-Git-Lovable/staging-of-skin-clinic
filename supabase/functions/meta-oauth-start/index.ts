import { META_SCOPES, GRAPH_VERSION } from "../_shared/meta-graph.ts";
import { corsHeaders, json, requireStaffId } from "../_shared/comms-auth.ts";
import { isAllowedOrigin, signState, DEFAULT_ORIGIN } from "../_shared/meta-oauth-state.ts";
import { isAdminOrManager } from "../_shared/meta-access.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = await requireStaffId(req);
    if (auth instanceof Response) return auth;
    if (!(await isAdminOrManager(auth.staffId))) return json({ error: "Only an admin or manager can connect Meta" }, 403);

    const appId = Deno.env.get("META_APP_ID");
    if (!appId) throw new Error("META_APP_ID is not configured");

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const requested: string = body.origin || req.headers.get("origin") || "";
    const origin = isAllowedOrigin(requested) ? requested : DEFAULT_ORIGIN;

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/meta-oauth-callback`;
    const state = await signState({ origin, staffId: auth.staffId });

    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", META_SCOPES.join(","));

    return json({ auth_url: url.toString(), redirect_uri: redirectUri });
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
