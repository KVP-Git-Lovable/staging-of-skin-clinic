import { describe, it, expect } from "vitest";
import { PASSWORD_MIN_LENGTH, passwordProblem } from "./passwordRules";

describe("passwordProblem", () => {
  it("accepts a password that meets every rule", () => {
    expect(passwordProblem("Clinic@2026")).toBeNull();
    expect(passwordProblem("Clinic@2026", "Clinic@2026")).toBeNull();
  });

  it("rejects one that is merely long enough", () => {
    // The old rule was six characters and nothing else, so the form accepted
    // passwords the API then refused.
    expect(passwordProblem("password")).toMatch(/uppercase/);
    expect(passwordProblem("PASSWORD1!")).toMatch(/uppercase|lowercase/);
    expect(passwordProblem("Password!")).toMatch(/number/);
    expect(passwordProblem("Password1")).toMatch(/symbol/);
  });

  it("checks length before anything else", () => {
    expect(passwordProblem("Ab1!")).toBe(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  });

  it("only compares the confirmation when one is given", () => {
    expect(passwordProblem("Clinic@2026", "Clinic@2027")).toBe("Passwords do not match");
    expect(passwordProblem("Clinic@2026")).toBeNull();
  });

  it("does not throw on an empty password", () => {
    expect(passwordProblem("")).toMatch(/at least/);
  });
});
