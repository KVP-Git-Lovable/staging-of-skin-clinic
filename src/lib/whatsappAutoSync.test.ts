import { describe, it, expect } from "vitest";
import {
  AUTO_SYNC_DAYS,
  CONVERSATION_POLL_MS,
  STATUS_SYNC_MS,
  lastUpdatedLabel,
  shouldAutoSync,
} from "./whatsappAutoSync";

describe("the intervals", () => {
  it("reads the conversations far more often than it troubles Twilio", () => {
    // Re-reading the database is two indexed reads; asking Twilio is a network
    // round trip over a shared account. They should not be on the same clock.
    expect(CONVERSATION_POLL_MS).toBeLessThan(STATUS_SYNC_MS);
  });

  it("looks back far enough to catch last night, and no further", () => {
    expect(AUTO_SYNC_DAYS).toBeGreaterThanOrEqual(1);
    expect(AUTO_SYNC_DAYS).toBeLessThanOrEqual(7);
  });
});

describe("shouldAutoSync", () => {
  const now = 1_000_000;

  it("syncs when nothing has synced yet", () => {
    expect(shouldAutoSync(null, now)).toBe(true);
  });

  it("does not follow a manual Refresh with an automatic one", () => {
    expect(shouldAutoSync(now - 5_000, now)).toBe(false);
    expect(shouldAutoSync(now - 59_000, now)).toBe(false);
  });

  it("syncs again once the quiet period has passed", () => {
    expect(shouldAutoSync(now - 60_000, now)).toBe(true);
    expect(shouldAutoSync(now - 300_000, now)).toBe(true);
  });
});

describe("lastUpdatedLabel", () => {
  const now = 10_000_000;

  it("says nothing before the first sync", () => {
    expect(lastUpdatedLabel(null, now)).toBe("");
  });

  it("counts in minutes, then hours", () => {
    expect(lastUpdatedLabel(now - 10_000, now)).toBe("Updated just now");
    expect(lastUpdatedLabel(now - 60_000, now)).toBe("Updated 1 min ago");
    expect(lastUpdatedLabel(now - 5 * 60_000, now)).toBe("Updated 5 min ago");
    expect(lastUpdatedLabel(now - 60 * 60_000, now)).toBe("Updated 1 hour ago");
    expect(lastUpdatedLabel(now - 3 * 60 * 60_000, now)).toBe("Updated 3 hours ago");
  });

  it("does not read as the future when the clocks disagree", () => {
    // Two machines, one slightly ahead: "Updated -2 min ago" is worse than
    // saying nothing useful.
    expect(lastUpdatedLabel(now + 30_000, now)).toBe("Updated just now");
  });
});
