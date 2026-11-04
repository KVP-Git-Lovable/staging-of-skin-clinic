import { describe, it, expect } from "vitest";
import { pickActiveView } from "./pickActiveView";
import { ALL_VIEW_ID, RECENT_VIEW_ID } from "./standardViews";

const views = [{ id: "v-shared" }, { id: "v-mine" }, { id: "v-plain" }];

describe("pickActiveView", () => {
  it("opens on the view that was last chosen in this session", () => {
    expect(pickActiveView({ stored: "v-plain", pinned: "v-mine", views })).toEqual({
      id: "v-plain",
      forget: false,
    });
  });

  it("opens on this user's pinned view when nothing was chosen", () => {
    expect(pickActiveView({ stored: null, pinned: "v-mine", views })).toEqual({
      id: "v-mine",
      forget: false,
    });
  });

  it("honours a pin on a view somebody else owns and shared", () => {
    // The clinic's landing view was created by one person for all of them.
    // Pinning it must work for everyone who can see it.
    expect(pickActiveView({ stored: null, pinned: "v-shared", views }).id).toBe("v-shared");
  });

  it("honours a pin on a standard view, which has no row of its own", () => {
    expect(pickActiveView({ stored: null, pinned: RECENT_VIEW_ID, views }).id).toBe(RECENT_VIEW_ID);
  });

  it("falls back to All when the pinned view has been deleted", () => {
    expect(pickActiveView({ stored: null, pinned: "v-gone", views })).toEqual({
      id: ALL_VIEW_ID,
      forget: false,
    });
  });

  it("forgets a remembered view this user can no longer see, and uses the pin", () => {
    // A private view belonging to whoever used the machine last.
    expect(pickActiveView({ stored: "v-gone", pinned: "v-mine", views })).toEqual({
      id: "v-mine",
      forget: true,
    });
  });

  it("keeps a standard view without needing it in the list", () => {
    expect(pickActiveView({ stored: ALL_VIEW_ID, pinned: "v-mine", views })).toEqual({
      id: ALL_VIEW_ID,
      forget: false,
    });
    expect(pickActiveView({ stored: RECENT_VIEW_ID, views }).id).toBe(RECENT_VIEW_ID);
  });

  it("falls back to All when there is nothing to go on", () => {
    expect(pickActiveView({ stored: null, pinned: null, views: [] })).toEqual({
      id: ALL_VIEW_ID,
      forget: false,
    });
  });
});

