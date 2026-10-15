import { assertEquals } from "jsr:@std/assert@1";
import { INSTAGRAM_PAGE_FIELDS, pickInstagramAccount, resolveInstagramAccount, withInstagramIdentity } from "./meta-graph.ts";

Deno.test("pickInstagramAccount prefers the business-linked account", () => {
  assertEquals(
    pickInstagramAccount({ instagram_business_account: { id: "1", username: "biz" }, connected_instagram_account: { id: "2", username: "page" } }),
    { id: "1", username: "biz" },
  );
});

Deno.test("pickInstagramAccount falls back to the Page-settings account", () => {
  assertEquals(pickInstagramAccount({ connected_instagram_account: { id: "2" } }), { id: "2", username: null });
});

Deno.test("pickInstagramAccount returns null when no account is linked", () => {
  assertEquals(pickInstagramAccount({ id: "p" }), null);
  assertEquals(pickInstagramAccount(undefined), null);
});

Deno.test("resolveInstagramAccount tries the user token first and returns Meta's error when all fail", async () => {
  const calls: Array<{ token: string; fields: string }> = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const u = new URL(String(input));
    calls.push({ token: u.searchParams.get("access_token") || "", fields: u.searchParams.get("fields") || "" });
    return Promise.resolve(new Response(JSON.stringify({ error: { message: "(#10) requires instagram_basic", code: 10 } }), { status: 400 }));
  }) as typeof fetch;
  try {
    const r = await resolveInstagramAccount("636872322849645", { user: "USER", page: "PAGE" });
    assertEquals(r.account, null);
    assertEquals(typeof r.error, "string");
    assertEquals(calls.map((c) => c.token), ["USER", "PAGE"]);
    assertEquals(calls[0].fields, INSTAGRAM_PAGE_FIELDS);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("resolveInstagramAccount stops at the first successful read", async () => {
  const realFetch = globalThis.fetch;
  let n = 0;
  globalThis.fetch = (() => {
    n++;
    return Promise.resolve(new Response(JSON.stringify({ id: "p", instagram_business_account: { id: "9", username: "trayi" } }), { status: 200 }));
  }) as typeof fetch;
  try {
    const r = await resolveInstagramAccount("p", { user: "USER", page: "PAGE" });
    assertEquals(r, { account: { id: "9", username: "trayi" }, error: null });
    assertEquals(n, 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});

Deno.test("withInstagramIdentity adds instagram_user_id only when an id is given", () => {
  const spec = { page_id: "989032514296700", link_data: { link: "https://x.y", message: "m" } };
  assertEquals(withInstagramIdentity(spec, "25897183486647189"), { ...spec, instagram_user_id: "25897183486647189" });
  assertEquals(withInstagramIdentity(spec, null), spec);
  assertEquals(withInstagramIdentity(spec, "  "), spec);
  assertEquals(spec, { page_id: "989032514296700", link_data: { link: "https://x.y", message: "m" } }); // input untouched
});
