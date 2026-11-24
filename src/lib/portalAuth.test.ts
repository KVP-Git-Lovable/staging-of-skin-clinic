import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { transpileModule, ModuleKind } from "typescript";

// Execute the actual edge handler with an in-memory REST boundary. No clinic
// records, PINs, or sessions are touched by these regression tests.
const source = readFileSync("supabase/functions/portal-auth/index.ts", "utf8");
const family = [
  { id: "family-a", first_name: "Test", last_name: "One", portal_pin_hash: null },
  { id: "family-b", first_name: "Test", last_name: "Two", portal_pin_hash: "existing-hash" },
];

async function handlerFor(candidates = family) {
  let handler: ((request: Request) => Promise<Response>) | undefined;
  vi.stubGlobal("Deno", {
    env: { get: () => "test-only" },
    serve: (fn: typeof handler) => { handler = fn; },
  });
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(candidates)));
  const compiled = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext } });
  new Function(compiled.outputText)();
  if (!handler) throw new Error("Edge handler was not registered");
  const serve = handler;
  return async (patientId?: string) => {
    const response = await serve(new Request("https://test.invalid", {
      method: "POST",
      body: JSON.stringify({ action: "check", phone: "9999999999", patientId }),
    }));
    return response.json();
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("portal-auth shared phone selection", () => {
  it("asks which family member when no patient has been selected", async () => {
    const check = await handlerFor();
    expect(await check()).toMatchObject({ status: "choose_patient", patients: [
      { id: "family-a" }, { id: "family-b" },
    ] });
  });

  it("allows the selected family member without a PIN to create one", async () => {
    const check = await handlerFor();
    expect(await check("family-a")).toEqual({
      status: "set_pin", patientId: "family-a", patientName: "Test One",
    });
  });

  it("asks for the selected family member's existing PIN", async () => {
    const check = await handlerFor();
    expect(await check("family-b")).toEqual({
      status: "pin_required", patientId: "family-b", patientName: "Test Two",
    });
  });

  it("does not accept a patient from another phone", async () => {
    const check = await handlerFor();
    expect((await check("unrelated-patient")).status).toBe("choose_patient");
  });

  it("keeps single-patient sign-in working without a chooser", async () => {
    const check = await handlerFor([family[1]]);
    expect((await check()).status).toBe("pin_required");
  });
});