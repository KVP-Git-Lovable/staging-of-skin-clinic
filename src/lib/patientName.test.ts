import { describe, it, expect } from "vitest";
import { isPhoneLikeName, hasRealName, rawPatientName } from "./patientName";

describe("isPhoneLikeName", () => {
  it("spots the phone numbers sitting in the name column", () => {
    // All 153 of these hold first_name equal to phone, exactly.
    expect(isPhoneLikeName("6282285155")).toBe(true);
    expect(isPhoneLikeName("+91 62822 85155")).toBe(true);
    expect(isPhoneLikeName("(628) 228-5155")).toBe(true);
  });

  it("leaves a real name alone", () => {
    expect(isPhoneLikeName("Prema Shetty")).toBe(false);
    expect(isPhoneLikeName("Lona")).toBe(false);
  });

  it("does not mistake a name carrying a digit for a phone number", () => {
    expect(isPhoneLikeName("Dr K2")).toBe(false);
    expect(isPhoneLikeName("Ram 2nd")).toBe(false);
  });

  it("is not fooled by a short string of digits, which is not a phone number", () => {
    expect(isPhoneLikeName("123")).toBe(false);
  });

  it("treats blank as nothing rather than a phone number", () => {
    expect(isPhoneLikeName("")).toBe(false);
    expect(isPhoneLikeName(null)).toBe(false);
    expect(isPhoneLikeName("   ")).toBe(false);
  });
});

describe("hasRealName", () => {
  it("passes a patient with a name", () => {
    expect(hasRealName({ first_name: "Prema", last_name: "Shetty" })).toBe(true);
    expect(hasRealName({ first_name: "Lona", last_name: null })).toBe(true);
  });

  it("fails a patient whose name is their phone number", () => {
    expect(hasRealName({ first_name: "6282285155", last_name: null })).toBe(false);
    expect(hasRealName({ first_name: "+91 62822 85155", last_name: "" })).toBe(false);
  });

  it("fails a patient with no name at all", () => {
    expect(hasRealName({ first_name: "", last_name: "  " })).toBe(false);
    expect(hasRealName(null)).toBe(false);
  });
});

describe("rawPatientName", () => {
  it("joins both parts and tidies the spacing", () => {
    expect(rawPatientName({ first_name: " Prema ", last_name: " Shetty " })).toBe("Prema Shetty");
    expect(rawPatientName({ first_name: "Lona", last_name: null })).toBe("Lona");
  });
});
