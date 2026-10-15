import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_ORIGIN, isAllowedOrigin, returnOrigin, signState, verifyState } from "./meta-oauth-state.ts";

Deno.env.set("META_APP_SECRET", "test-secret");

Deno.test("signed state round-trips and carries the origin", async () => {
  const state = await signState({ origin: "http://localhost:8080", staffId: "s1" });
  const v = await verifyState(state);
  assertEquals(v?.staffId, "s1");
  assertEquals(returnOrigin(v), "http://localhost:8080");
});

Deno.test("tampered, unsigned or foreign-origin state is rejected", async () => {
  const state = await signState({ origin: DEFAULT_ORIGIN, staffId: "s1" });
  const [data, sig] = state.split(".");
  assertEquals(await verifyState(`${data}x.${sig}`), null);
  assertEquals(await verifyState(btoa(JSON.stringify({ origin: DEFAULT_ORIGIN }))), null);
  assertEquals(await verifyState(null), null);
  // A validly signed state for an origin that is not allow-listed is also refused.
  const evil = await signState({ origin: "https://evil.example", staffId: "s1" });
  assertEquals(await verifyState(evil), null);
  assertEquals(returnOrigin(null), DEFAULT_ORIGIN);
});

Deno.test("origin allow-list", () => {
  assertEquals(isAllowedOrigin("https://clinic.quickapp.ai"), true);
  assertEquals(isAllowedOrigin("https://evil.example"), false);
  assertEquals(isAllowedOrigin(undefined), false);
});
