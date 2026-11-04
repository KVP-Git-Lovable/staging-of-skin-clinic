import { describe, it, expect } from "vitest";
import { isThreadUnread, unreadCount, READ_BASELINE_PHONE } from "./whatsappUnread";

const patientWrote = { phone: "+919876543210", last_inbound_at: "2026-10-15T10:04:00Z" };
const noReads = { byPhone: {} as Record<string, string | undefined>, baseline: null };

describe("isThreadUnread", () => {
  it("marks a thread the patient has written to since it was last opened", () => {
    expect(isThreadUnread(patientWrote, { byPhone: { [patientWrote.phone]: "2026-10-15T09:00:00Z" } })).toBe(true);
  });

  it("stays marked even though the bot has already replied", () => {
    // The fault that made the first version useless: whatsapp-webhook answers
    // every patient message, so every thread ends outbound. A reply the bot has
    // auto-answered is exactly the one somebody still has to act on.
    expect(isThreadUnread(patientWrote, noReads)).toBe(true);
  });

  it("clears once the thread has been opened", () => {
    expect(isThreadUnread(patientWrote, { byPhone: { [patientWrote.phone]: "2026-10-15T10:05:00Z" } })).toBe(false);
  });

  it("never marks a number the patient has never written to", () => {
    expect(isThreadUnread({ phone: "+910000000000", last_inbound_at: null }, noReads)).toBe(false);
    expect(isThreadUnread({ phone: "+910000000000" }, noReads)).toBe(false);
  });

  it("does not leave a mark nobody can clear", () => {
    // An unreadable date, and a read stamp from a machine running slightly
    // ahead: neither should pin a dot on the list for ever.
    expect(isThreadUnread({ ...patientWrote, last_inbound_at: "not a date" }, noReads)).toBe(false);
    expect(isThreadUnread(patientWrote, { byPhone: { [patientWrote.phone]: "2026-10-15T10:04:30Z" } })).toBe(false);
  });

  it("falls back to the baseline for a thread never opened", () => {
    // Everything older than the first time somebody used the page counts as
    // seen, or the feature arrives as 178 marks covering months of history.
    expect(isThreadUnread(patientWrote, { byPhone: {}, baseline: "2026-10-15T11:00:00Z" })).toBe(false);
    expect(isThreadUnread(patientWrote, { byPhone: {}, baseline: "2026-10-15T09:00:00Z" })).toBe(true);
  });

  it("prefers the thread's own mark over the baseline", () => {
    expect(isThreadUnread(patientWrote, {
      byPhone: { [patientWrote.phone]: "2026-10-15T09:00:00Z" },
      baseline: "2026-10-15T11:00:00Z",
    })).toBe(true);
  });
});

describe("unreadCount", () => {
  it("counts only the threads waiting on the clinic", () => {
    const threads = [
      { phone: "a", last_inbound_at: "2026-10-15T10:00:00Z" },
      { phone: "b", last_inbound_at: "2026-10-15T10:00:00Z" },
      { phone: "c", last_inbound_at: null },
    ];
    expect(unreadCount(threads, { byPhone: { b: "2026-10-15T11:00:00Z" } })).toBe(1);
  });
});

describe("READ_BASELINE_PHONE", () => {
  it("cannot collide with a real number", () => {
    expect(READ_BASELINE_PHONE).toBe("*");
  });
});
