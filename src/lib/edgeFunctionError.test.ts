import { describe, it, expect } from "vitest";
import { EDGE_FUNCTION_UNREACHABLE, WEAK_PASSWORD_MESSAGE, edgeFunctionErrorMessage } from "./edgeFunctionError";

const httpError = (body: unknown, message = "Edge Function returned a non-2xx status code") => ({
  message,
  context: { json: async () => body },
});

describe("edgeFunctionErrorMessage", () => {
  it("surfaces what the function actually said", async () => {
    // The whole point: this text exists, and was being discarded.
    await expect(edgeFunctionErrorMessage(httpError({ error: "A user with this email address has already been registered" })))
      .resolves.toBe("A user with this email address has already been registered");
  });

  it("accepts a body that uses message instead of error", async () => {
    await expect(edgeFunctionErrorMessage(httpError({ message: "Service role key missing" })))
      .resolves.toBe("Service role key missing");
  });

  it("explains the generic wrapper rather than repeating it", async () => {
    // A function that is not deployed returns no usable body, and
    // "non-2xx status code" is not something a clinic manager can act on.
    await expect(edgeFunctionErrorMessage(httpError(undefined))).resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
    await expect(edgeFunctionErrorMessage({ message: "Edge Function returned a non-2xx status code" }))
      .resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
  });

  it("survives a body that is not JSON", async () => {
    const err = { message: "Edge Function returned a non-2xx status code", context: { json: async () => { throw new SyntaxError("not json"); } } };
    await expect(edgeFunctionErrorMessage(err)).resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
  });

  it("passes a real error through untouched", async () => {
    await expect(edgeFunctionErrorMessage(new Error("Failed to fetch"))).resolves.toBe("Failed to fetch");
    await expect(edgeFunctionErrorMessage({ message: "Name and email are required" }))
      .resolves.toBe("Name and email are required");
  });

  it("never throws on nothing", async () => {
    await expect(edgeFunctionErrorMessage(null)).resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
    await expect(edgeFunctionErrorMessage(undefined)).resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
    await expect(edgeFunctionErrorMessage({})).resolves.toBe(EDGE_FUNCTION_UNREACHABLE);
  });

  it("lets the caller name a better fallback", async () => {
    await expect(edgeFunctionErrorMessage(httpError(undefined), "Could not send the invoice."))
      .resolves.toBe("Could not send the invoice.");
  });
});

describe("weak-password rejections", () => {
  it("translates what Supabase says into what the operator should do", async () => {
    // Supabase refuses passwords found in a breach corpus; the raw wording is
    // not something to put in front of a clinic manager.
    for (const raw of [
      "Password is known to be weak and easy to guess, please choose a different one",
      "This password has been pwned",
      "found in a data breach",
    ]) {
      await expect(edgeFunctionErrorMessage({ message: raw })).resolves.toBe(WEAK_PASSWORD_MESSAGE);
    }
  });

  it("translates it from the function's own body too", async () => {
    await expect(
      edgeFunctionErrorMessage({
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "Password is too weak" }) },
      }),
    ).resolves.toBe(WEAK_PASSWORD_MESSAGE);
  });

  it("leaves an unrelated message alone", async () => {
    await expect(edgeFunctionErrorMessage({ message: "Email rate limit exceeded" }))
      .resolves.toBe("Email rate limit exceeded");
  });
});
