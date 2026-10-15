import { assertEquals } from "jsr:@std/assert@1";
import { leadInsertFromSubmission, phoneMatchKey } from "./meta-leadforms.ts";

const fd = (obj: Record<string, string>) => Object.entries(obj).map(([name, v]) => ({ name, values: [v] }));

Deno.test("leadInsertFromSubmission maps standard fields and sets interest from the ad name", () => {
  const row = leadInsertFromSubmission(fd({ full_name: "Satish Chussama", email: "s@x.in", phone_number: "+91 98765 43210", city: "Mangaluru", budget: "50k" }), "Dasara and Diwali Ad 2026");
  assertEquals(row, { name: "Satish Chussama", email: "s@x.in", phone: "+919876543210", city: "Mangaluru", source: "Meta Lead Ad", interest: "Meta - Dasara and Diwali Ad 2026" });
});

Deno.test("leadInsertFromSubmission returns null without a phone and falls back for the name", () => {
  assertEquals(leadInsertFromSubmission(fd({ full_name: "No Phone", email: "a@b.c" }), "Ad"), null);
  assertEquals(leadInsertFromSubmission(fd({ phone: "9876543210" }), "Ad")?.name, "9876543210");
  assertEquals(leadInsertFromSubmission(fd({ first_name: "A", last_name: "B", phone_number: "9876543210" }), "")?.interest, "Meta - Lead ad");
});

Deno.test("phoneMatchKey compares the last 10 digits", () => {
  assertEquals(phoneMatchKey("+91 98765-43210"), "9876543210");
  assertEquals(phoneMatchKey("9876543210"), "9876543210");
  assertEquals(phoneMatchKey("12345"), "12345");
});
