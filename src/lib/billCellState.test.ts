import { describe, it, expect } from "vitest";
import { billCellState } from "./billCellState";

const state = (o: Partial<Parameters<typeof billCellState>[0]>) =>
  billCellState({ hasInvoice: false, loading: false, failed: false, ...o });

describe("billCellState", () => {
  it("says there is no bill, rather than showing a bare dash", () => {
    // A free Review follow-up. The clinic read the old dash as missing data and
    // reported the day as unbilled three times.
    expect(state({})).toBe("none");
  });

  it("shows the amount when there is one", () => {
    expect(state({ hasInvoice: true })).toBe("amount");
  });

  it("never claims there is no bill when the lookup failed", () => {
    // This is the only case where the figure is genuinely unknown.
    expect(state({ failed: true })).toBe("failed");
  });

  it("never claims there is no bill before the query resolves", () => {
    expect(state({ loading: true })).toBe("loading");
  });

  it("keeps showing a figure it already has through a refetch or a failure", () => {
    expect(state({ hasInvoice: true, loading: true })).toBe("amount");
    expect(state({ hasInvoice: true, failed: true })).toBe("amount");
  });

  it("reports a failure ahead of a retry still in flight", () => {
    expect(state({ loading: true, failed: true })).toBe("failed");
  });

  it("says the bill is on another visit rather than denying it exists", () => {
    // Kiran Shetty held two appointment records for one 4:00 PM slot and one
    // bill of Rs 6,300. The row without it read "No bill" while he had paid.
    expect(state({ billedElsewhere: true })).toBe("elsewhere");
  });

  it("prefers the real reasons over the sibling hint", () => {
    expect(state({ billedElsewhere: true, hasInvoice: true })).toBe("amount");
    expect(state({ billedElsewhere: true, failed: true })).toBe("failed");
    expect(state({ billedElsewhere: true, loading: true })).toBe("loading");
  });
});
