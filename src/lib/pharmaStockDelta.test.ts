import { describe, it, expect } from "vitest";
import { stockDelta } from "./pharmaStockDelta";

describe("stockDelta", () => {
  it("moves nothing when the lines are unchanged", () => {
    const lines = [{ inventory_id: "batch-1", quantity: 2, uom_factor: 1 }];
    // An edit that only touched Notes must not shuffle stock.
    expect(stockDelta(lines, lines)).toEqual({});
  });

  it("takes more off the shelf when the quantity goes up", () => {
    const delta = stockDelta(
      [{ inventory_id: "batch-1", quantity: 2, uom_factor: 1 }],
      [{ inventory_id: "batch-1", quantity: 5, uom_factor: 1 }],
    );
    expect(delta).toEqual({ "batch-1": -3 });
  });

  it("puts stock back when the quantity comes down", () => {
    const delta = stockDelta(
      [{ inventory_id: "batch-1", quantity: 5, uom_factor: 1 }],
      [{ inventory_id: "batch-1", quantity: 2, uom_factor: 1 }],
    );
    expect(delta).toEqual({ "batch-1": 3 });
  });

  it("returns all of it when a line is removed", () => {
    expect(stockDelta([{ inventory_id: "batch-1", quantity: 4, uom_factor: 1 }], [])).toEqual({ "batch-1": 4 });
  });

  it("takes it when a line is added", () => {
    expect(stockDelta([], [{ inventory_id: "batch-1", quantity: 4, uom_factor: 1 }])).toEqual({ "batch-1": -4 });
  });

  it("converts the selling UOM into base units on both sides", () => {
    // Billed in strips of 10 tablets: 3 strips out, 1 strip back = 20 tablets.
    const delta = stockDelta(
      [{ inventory_id: "batch-1", quantity: 3, uom_factor: 10 }],
      [{ inventory_id: "batch-1", quantity: 1, uom_factor: 10 }],
    );
    expect(delta).toEqual({ "batch-1": 20 });
  });

  it("handles a line moved to a different batch", () => {
    const delta = stockDelta(
      [{ inventory_id: "batch-1", quantity: 2, uom_factor: 1 }],
      [{ inventory_id: "batch-2", quantity: 2, uom_factor: 1 }],
    );
    expect(delta).toEqual({ "batch-1": 2, "batch-2": -2 });
  });

  it("nets out the same product billed on two lines", () => {
    const delta = stockDelta(
      [{ inventory_id: "batch-1", quantity: 2 }, { inventory_id: "batch-1", quantity: 3 }],
      [{ inventory_id: "batch-1", quantity: 5 }],
    );
    expect(delta).toEqual({});
  });

  it("ignores a line with no batch rather than writing to nowhere", () => {
    expect(stockDelta([{ inventory_id: "", quantity: 9 }], [])).toEqual({});
  });
});
