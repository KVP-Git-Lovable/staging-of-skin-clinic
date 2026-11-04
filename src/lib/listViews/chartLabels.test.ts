import { describe, it, expect } from "vitest";
import { computeChartData, NO_VALUE_LABEL, type FieldDef, type ViewChart } from "./engine";

const FIELDS: FieldDef[] = [
  { key: "doctor", label: "Doctor", type: "picklist", optionsSource: "doctor" },
  { key: "payment_mode", label: "Payment Mode", type: "text" },
];

const chart = (group_field: string): ViewChart => ({
  id: "c1",
  name: "Appointments by",
  chart_type: "vertical_bar",
  aggregate: "count",
  group_field,
});

const optionsFor = (source?: string) =>
  source === "doctor"
    ? [
        { value: "e82d048f-9a27-4e5b-91ff-ad9da4ff0c68", label: "Dr Vindhya Pai" },
        { value: "faee2cbb-adfd-442f-85ef-2ae0d27e20ae", label: "Dr P Suraksha" },
      ]
    : [];

describe("computeChartData labels", () => {
  it("names the doctor rather than printing the id stored against the visit", () => {
    const rows = [
      { doctor: "e82d048f-9a27-4e5b-91ff-ad9da4ff0c68" },
      { doctor: "e82d048f-9a27-4e5b-91ff-ad9da4ff0c68" },
      { doctor: "faee2cbb-adfd-442f-85ef-2ae0d27e20ae" },
    ];
    expect(computeChartData(rows, chart("doctor"), FIELDS, undefined, optionsFor)).toEqual([
      { name: "Dr Vindhya Pai", value: 2 },
      { name: "Dr P Suraksha", value: 1 },
    ]);
  });

  it("keeps the stored value when the choices do not explain it", () => {
    // A doctor who has left the active list still has appointments; showing
    // the id is better than hiding the bar.
    const rows = [{ doctor: "6d2329a5-4055-42f3-8bb9-77a81b30fb15" }];
    expect(computeChartData(rows, chart("doctor"), FIELDS, undefined, optionsFor)).toEqual([
      { name: "6d2329a5-4055-42f3-8bb9-77a81b30fb15", value: 1 },
    ]);
  });

  it("calls an empty group what it is, rather than a dash", () => {
    const rows = [{ payment_mode: "UPI" }, { payment_mode: "" }, { payment_mode: null }];
    expect(computeChartData(rows, chart("payment_mode"), FIELDS)).toEqual([
      { name: NO_VALUE_LABEL, value: 2 },
      { name: "UPI", value: 1 },
    ]);
  });

  it("leaves a text field's own words alone", () => {
    const rows = [{ payment_mode: "Cash" }, { payment_mode: "Cash" }, { payment_mode: "Card" }];
    expect(computeChartData(rows, chart("payment_mode"), FIELDS, undefined, optionsFor)).toEqual([
      { name: "Cash", value: 2 },
      { name: "Card", value: 1 },
    ]);
  });
});
