import { describe, expect, it } from "vitest";
import { reviewTemplateParams } from "../../supabase/functions/send-google-review-whatsapp/template";
import { toE164IN } from "../../supabase/functions/_shared/comms-phone";

describe("Google review template sending", () => {
  it("sends the approved template without variables or free-text substitution", () => {
    const params = reviewTemplateParams("+919606342269", "+911234567890", "configured-template");
    expect(params.get("ContentSid")).toBe("configured-template");
    expect(params.has("ContentVariables")).toBe(false);
    expect(params.has("Body")).toBe(false);
    expect(params.get("To")).toBe("whatsapp:+919606342269");
  });
  it("preserves an already-prefixed clinic sender", () => {
    expect(reviewTemplateParams("+919606342269", "whatsapp:+911234567890", "configured-template").get("From"))
      .toBe("whatsapp:+911234567890");
  });
  it("normalizes the clinic's stored Indian mobile numbers and rejects missing numbers", () => {
    expect(toE164IN("9606342269")).toBe("+919606342269");
    expect(toE164IN(null)).toBeNull();
    expect(toE164IN("not a phone")).toBeNull();
  });
});
import { REVIEW_TEXT, reviewSessionParams, isWithinServiceWindow } from "../../supabase/functions/send-google-review-whatsapp/template";
import { GOOGLE_REVIEW_MESSAGE } from "@/lib/googleReview";

describe("Google review inside the 24-hour window", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  it("uses the approved wording exactly", () => {
    expect(REVIEW_TEXT).toBe(GOOGLE_REVIEW_MESSAGE);
    expect(reviewSessionParams("+919606342269", "+911234567890").get("Body")).toBe(GOOGLE_REVIEW_MESSAGE);
    expect(reviewSessionParams("+919606342269", "+911234567890").has("ContentSid")).toBe(false);
  });
  it("counts a patient message from 23 hours ago as inside the window", () => {
    expect(isWithinServiceWindow("2026-10-22T13:00:00Z", now)).toBe(true);
  });
  it("counts a patient message from 25 hours ago, or none, as outside it", () => {
    expect(isWithinServiceWindow("2026-10-22T11:00:00Z", now)).toBe(false);
    expect(isWithinServiceWindow(null, now)).toBe(false);
  });
});
