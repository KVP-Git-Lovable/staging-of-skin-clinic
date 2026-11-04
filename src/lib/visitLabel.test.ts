import { describe, it, expect } from "vitest";
import { visitLabel } from "./visitLabel";

describe("visitLabel", () => {
  it("names today's visit the way the appointments list does", () => {
    // Vaishnavi, 5 October: booked in the app, so service is empty.
    expect(
      visitLabel({ reason_for_consultation: "5RX Face Hair Reduction Maintainence", service: "" }),
    ).toBe("5RX Face Hair Reduction Maintainence");
  });

  it("falls back to the service an imported visit carries", () => {
    expect(visitLabel({ reason_for_consultation: null, service: "4RX Face Hair Reduction" })).toBe(
      "4RX Face Hair Reduction",
    );
  });

  it("prefers the Investigation when a visit has both", () => {
    expect(visitLabel({ reason_for_consultation: "Review", service: "Consultation" })).toBe("Review");
  });

  it("says Visit only when there is genuinely nothing to show", () => {
    expect(visitLabel({ reason_for_consultation: "", service: "" })).toBe("Visit");
    expect(visitLabel({})).toBe("Visit");
    expect(visitLabel(null)).toBe("Visit");
  });

  it("does not treat whitespace as a name", () => {
    expect(visitLabel({ reason_for_consultation: "   ", service: "  " })).toBe("Visit");
    expect(visitLabel({ reason_for_consultation: "  ", service: "Consultation" })).toBe("Consultation");
  });
});
