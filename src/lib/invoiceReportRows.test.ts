import { describe, it, expect } from "vitest";
import {
  attachMaterialCost,
  invoiceServiceLabel,
  invoiceServiceNames,
  rowMatchesService,
  materialCostFields,
  materialPercentLabel,
} from "./invoiceReportRows";

describe("materialPercentLabel", () => {
  it("names the one percentage a bill was costed at", () => {
    expect(materialPercentLabel([5])).toBe("5%");
    expect(materialPercentLabel(["12.5"])).toBe("12.5%");
    expect(materialPercentLabel([5, 5, 5])).toBe("5%");
  });

  it("lists both rather than averaging them", () => {
    // 170 invoices have lines at different percentages. An average is a figure
    // nobody set - the blended "3.36%" GST fault again.
    expect(materialPercentLabel([10, 5])).toBe("5% + 10%");
    expect(materialPercentLabel([5, 10])).not.toContain("7.5");
  });

  it("says nothing when no line carries one", () => {
    expect(materialPercentLabel([])).toBe("");
    expect(materialPercentLabel([0, null, undefined, "", "abc"])).toBe("");
  });

  it("drops a trailing .00 so the column reads like a percentage", () => {
    expect(materialPercentLabel([5.0])).toBe("5%");
    expect(materialPercentLabel([7.5])).toBe("7.5%");
  });
});

describe("materialCostFields", () => {
  it("adds up the lines' own rounded rupees", () => {
    expect(
      materialCostFields([
        { material_percent: 5, material_cost: 127.62 },
        { material_percent: 10, material_cost: 40 },
      ]),
    ).toEqual({ material_percent_label: "5% + 10%", material_cost_total: 167.62 });
  });

  it("leaves a bill with no recorded percentage blank, not zero", () => {
    // Most bills have none: the percentage is matched by service name against
    // the Service Master. 0.00 would read as "this cost nothing".
    expect(materialCostFields([])).toEqual({
      material_percent_label: "",
      material_cost_total: null,
    });
  });
});

describe("attachMaterialCost", () => {
  const invoices = [
    { id: "inv-1", invoice_number: "INV-1", total_amount: 10000 },
    { id: "inv-2", invoice_number: "INV-2", total_amount: 5000 },
  ];
  const lines = [
    { invoice_id: "inv-1", material_percent: 5, material_cost: 250 },
    { invoice_id: "inv-1", material_percent: 10, material_cost: 300 },
  ];

  it("puts each bill's lines on that bill", () => {
    const [one, two] = attachMaterialCost(invoices, lines);
    expect(one.material_percent_label).toBe("5% + 10%");
    expect(one.material_cost_total).toBe(550);
    expect(two.material_percent_label).toBe("");
    expect(two.material_cost_total).toBeNull();
  });

  it("changes nothing else on the row", () => {
    // The totals the summary cards and the revenue chart add up must be the
    // same figures they were before material cost arrived beside them.
    const [one] = attachMaterialCost(invoices, lines);
    expect(one.total_amount).toBe(10000);
    expect(one.invoice_number).toBe("INV-1");
    expect(invoices[0]).not.toHaveProperty("material_cost_total");
  });

  it("ignores a line that names no invoice", () => {
    const out = attachMaterialCost(invoices, [{ invoice_id: null, material_cost: 999 }]);
    expect(out.every((r) => r.material_cost_total === null)).toBe(true);
  });
});

describe("invoiceServiceLabel", () => {
  it("names what was billed, from the same lines the material figures come from", () => {
    expect(
      invoiceServiceLabel({ line_items: [{ name: "Laser toning" }, { name: "Hydra signature" }] }),
    ).toBe("Laser toning, Hydra signature");
  });

  it("counts a service billed twice once, and keeps the billed order", () => {
    expect(
      invoiceServiceLabel({ line_items: [{ name: "Peel" }, { name: "Laser" }, { name: "Peel" }] }),
    ).toBe("Peel, Laser");
  });

  it("falls back to the invoice's own services where there is no line snapshot", () => {
    expect(invoiceServiceLabel({ services: ["Consultation"] })).toBe("Consultation");
    expect(invoiceServiceLabel({ line_items: [], services: [{ name: "Facial" }] })).toBe("Facial");
  });

  it("is blank rather than noisy when there is nothing to name", () => {
    expect(invoiceServiceLabel({})).toBe("");
    expect(invoiceServiceLabel(null)).toBe("");
    expect(invoiceServiceLabel({ line_items: [{ name: "  " }, {}] })).toBe("");
  });
});

describe("invoiceServiceNames", () => {
  it("reads the names off the billed lines", () => {
    expect(
      invoiceServiceNames({ line_items: [{ name: "Laser toning" }, { name: "Hydra signature" }] }),
    ).toEqual(["Laser toning", "Hydra signature"]);
  });

  it("falls back to the services array on an older bill with no lines", () => {
    expect(invoiceServiceNames({ services: ["Peel B"] })).toEqual(["Peel B"]);
  });

  it("merges both places a service can be written down, without repeating one", () => {
    // The chart groups on `services`, the cell reads `line_items`. A bar
    // clicked from the chart has to be findable even when the two disagree.
    expect(
      invoiceServiceNames({
        line_items: [{ name: "Laser toning" }],
        services: ["Laser toning", "Consultation"],
      }),
    ).toEqual(["Laser toning", "Consultation"]);
  });

  it("has nothing to say about a bill carrying neither", () => {
    expect(invoiceServiceNames({})).toEqual([]);
    expect(invoiceServiceNames(null)).toEqual([]);
  });
});

describe("rowMatchesService", () => {
  const bill = { _services: ["Consultation", "Peel B"] };

  it("lets everything through when no service is chosen", () => {
    expect(rowMatchesService(bill, "all")).toBe(true);
    expect(rowMatchesService(bill, "")).toBe(true);
  });

  it("matches a bill on any one of the services it carries", () => {
    // This is the bug: invoice rows have no `service` field, so comparing one
    // rejected every row and the drill-down came back empty.
    expect(rowMatchesService(bill, "Consultation")).toBe(true);
    expect(rowMatchesService(bill, "Peel B")).toBe(true);
  });

  it("rejects a service the bill does not carry", () => {
    expect(rowMatchesService(bill, "Hydra signature")).toBe(false);
  });

  it("still matches an appointment row on its single service", () => {
    expect(rowMatchesService({ service: "Consultation" }, "Consultation")).toBe(true);
    expect(rowMatchesService({ service: "Consultation" }, "Peel B")).toBe(false);
    expect(rowMatchesService({ service: "" }, "Peel B")).toBe(false);
  });
});
