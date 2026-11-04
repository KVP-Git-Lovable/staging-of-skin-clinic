import { describe, it, expect } from "vitest";
import { deliveryOutcome, META_BLOCKED_MARKETING, OUTSIDE_SERVICE_WINDOW } from "./whatsappDelivery";

/**
 * The reported fault: the app said "Review request sent on WhatsApp" and the
 * patient received nothing. Twilio had accepted it; Meta then refused to
 * deliver it with error 63049. Both of those are in whatsapp_delivery_log.
 */
describe("deliveryOutcome", () => {
  it("only claims delivery when WhatsApp actually delivered", () => {
    expect(deliveryOutcome("delivered", null).delivered).toBe(true);
    expect(deliveryOutcome("read", null).delivered).toBe(true);
  });

  it("does not call a message sent just because Twilio accepted it", () => {
    // This is the exact distinction that was being lost.
    for (const accepted of ["queued", "sending", "sent", "accepted"]) {
      const outcome = deliveryOutcome(accepted, null);
      expect(outcome.delivered).toBe(false);
      expect(outcome.pending).toBe(true);
    }
  });

  it("explains 63049 in words the front desk can act on", () => {
    const outcome = deliveryOutcome("undelivered", META_BLOCKED_MARKETING);
    expect(outcome.delivered).toBe(false);
    expect(outcome.pending).toBe(false);
    // Must say it was not delivered, and what to do instead.
    expect(outcome.message).toMatch(/did not deliver/i);
    expect(outcome.message).toMatch(/marketing/i);
    expect(outcome.message).toMatch(/24 hours|try again/i);
  });

  it("names the closed service window for 63016", () => {
    const outcome = deliveryOutcome("failed", OUTSIDE_SERVICE_WINDOW);
    expect(outcome.message).toMatch(/24-hour window/i);
    expect(outcome.delivered).toBe(false);
  });

  it("still reports an unfamiliar failure, with its code", () => {
    const outcome = deliveryOutcome("undelivered", 63003);
    expect(outcome.delivered).toBe(false);
    expect(outcome.pending).toBe(false);
    expect(outcome.message).toContain("63003");
  });

  it("reports a failure with no code rather than going quiet", () => {
    expect(deliveryOutcome("failed", null).message).toMatch(/did not deliver/i);
  });

  it("treats nothing logged yet as unconfirmed, never as success", () => {
    expect(deliveryOutcome(null, null).pending).toBe(true);
    expect(deliveryOutcome(undefined, null).delivered).toBe(false);
    expect(deliveryOutcome("", null).delivered).toBe(false);
  });

  it("is not confused by the case Twilio sends", () => {
    expect(deliveryOutcome("DELIVERED", null).delivered).toBe(true);
    expect(deliveryOutcome("Undelivered", META_BLOCKED_MARKETING).pending).toBe(false);
  });
});
