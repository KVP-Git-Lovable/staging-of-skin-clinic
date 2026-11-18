import { assertEquals } from "jsr:@std/assert@1";
import { excludeOptedOut } from "./comms-audience.ts";
import { phoneLast10 } from "./comms-phone.ts";

const rows = [
  { id: "a", phone_e164: "+919876543210" },
  { id: "b", phone_e164: "+919800000001" },
  { id: "c", phone_e164: "+14155550123" },
];

Deno.test("phoneLast10 reads the last ten digits however the number is written", () => {
  assertEquals(phoneLast10("+91 98765 43210"), "9876543210");
  assertEquals(phoneLast10("09876543210"), "9876543210");
  assertEquals(phoneLast10("12345"), null);
  assertEquals(phoneLast10(null), null);
});

Deno.test("excludeOptedOut removes only the people on the list", () => {
  const { kept, removed } = excludeOptedOut(rows, new Set(["9876543210", "4155550123"]));
  assertEquals(kept.map((r) => r.id), ["b"]);
  assertEquals(removed, 2);
});

Deno.test("excludeOptedOut returns everyone when the list is empty", () => {
  const { kept, removed } = excludeOptedOut(rows, new Set());
  assertEquals(kept.length, 3);
  assertEquals(removed, 0);
});
