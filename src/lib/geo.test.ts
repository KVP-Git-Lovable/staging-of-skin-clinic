import { describe, it, expect, vi, afterEach } from "vitest";
import { formatFix, mapsLink, currentPosition, reverseGeocode } from "./geo";

describe("formatFix", () => {
  it("writes the fix to five decimals, which is metres", () => {
    expect(formatFix({ latitude: 12.871453, longitude: 74.843217, accuracy: 12 })).toBe("12.87145, 74.84322");
  });

  it("says nothing when there is no fix", () => {
    // Null is an ordinary outcome here, not an error: location is
    // best-effort and a denied permission must not cost a check-in.
    expect(formatFix(null)).toBe("");
    expect(formatFix(undefined)).toBe("");
  });

  it("refuses a nonsense fix rather than printing NaN in the admin list", () => {
    expect(formatFix({ latitude: Number.NaN, longitude: 74.8, accuracy: null })).toBe("");
    expect(formatFix({ latitude: 12.8, longitude: Infinity, accuracy: null })).toBe("");
  });
});

describe("mapsLink", () => {
  it("opens the spot in Google Maps", () => {
    expect(mapsLink({ latitude: 12.871453, longitude: 74.843217, accuracy: null }))
      .toBe("https://www.google.com/maps?q=12.871453,74.843217");
  });

  it("has nowhere to send you without a fix", () => {
    expect(mapsLink(null)).toBeNull();
    expect(mapsLink({ latitude: Number.NaN, longitude: 74.8, accuracy: null })).toBeNull();
  });
});

describe("currentPosition", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("hands back the fix when the browser gives one", async () => {
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (ok: (p: unknown) => void) =>
          ok({ coords: { latitude: 12.87, longitude: 74.84, accuracy: 9 } }),
      },
    });
    await expect(currentPosition()).resolves.toEqual({ latitude: 12.87, longitude: 74.84, accuracy: 9 });
  });

  it("resolves NULL rather than rejecting when permission is denied", async () => {
    // The whole contract. A rejection here would bubble out of the check-in
    // and somebody standing at the door would lose their day over a
    // permission prompt they declined.
    vi.stubGlobal("navigator", {
      geolocation: {
        getCurrentPosition: (_ok: unknown, fail: (e: unknown) => void) => fail({ code: 1 }),
      },
    });
    await expect(currentPosition()).resolves.toBeNull();
  });

  it("resolves null on a browser with no geolocation at all", async () => {
    vi.stubGlobal("navigator", {});
    await expect(currentPosition()).resolves.toBeNull();
  });

  /**
   * Note for anyone mutation-testing this: replacing the error callback with
   * a `throw` does NOT fail these tests, and that is correct rather than a
   * gap. The call sits inside a try/catch that resolves null, and there is a
   * safety timeout behind that, so the contract - "never rejects" - holds
   * three ways over. The guards are deliberate defence in depth, not
   * redundancy to be tidied away.
   */
  it("resolves null rather than throwing when the call itself blows up", async () => {
    vi.stubGlobal("navigator", {
      geolocation: { getCurrentPosition: () => { throw new Error("blocked by policy"); } },
    });
    await expect(currentPosition()).resolves.toBeNull();
  });
});

describe("reverseGeocode", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("returns the address the service gave", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: "Vyasa Rao Road, Mangalore, Karnataka" }),
    }));
    await expect(reverseGeocode(12.87, 74.84)).resolves.toBe("Vyasa Rao Road, Mangalore, Karnataka");
  });

  it("refuses a non-OK reply EVEN when it carries an address-shaped body", async () => {
    // The status is what decides, not the body. A cached or proxied error
    // page can carry a stale display_name, and the reference - which skips
    // the ok check entirely - would burn it onto the photo as the place
    // somebody checked in.
    //
    // An empty body would prove nothing here: that returns null whether the
    // ok check exists or not, which is how the first version of this test
    // passed against a mutant with the check deleted.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ display_name: "Somewhere Else Entirely" }),
    }));
    await expect(reverseGeocode(12.87, 74.84)).resolves.toBeNull();
  });

  it("returns null when the service is unreachable, never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(reverseGeocode(12.87, 74.84)).resolves.toBeNull();
  });

  it("returns null for a reply with no address in it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(reverseGeocode(12.87, 74.84)).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ display_name: "   " }) }));
    await expect(reverseGeocode(12.87, 74.84)).resolves.toBeNull();
  });
});
