import { describe, it, expect } from "vitest";
import {
  parentServiceName,
  linesToWrite,
  matchStoredRows,
  namesFromParent,
  dedupeByName,
} from "./serviceLineSave";

describe("parentServiceName", () => {
  it("is the roll-up of the services that remain", () => {
    expect(
      parentServiceName(
        [{ id: "a", service_name: "HYDRADELUXE" }, { id: "b", service_name: "EXION MNRF" }],
        true,
        "HYDRADELUXE, EXION MNRF, GFC",
      ),
    ).toBe("HYDRADELUXE, EXION MNRF");
  });

  it("clears the name when every service was removed, so the document stops printing one", () => {
    expect(parentServiceName([], true, "EXION MNRF")).toBe("");
  });

  it("keeps the name of a visit that never had service lines", () => {
    // Scan Prescription writes the name on the visit itself and no lines, and
    // imported visits have none either. The printed document reads that name -
    // clearing it would lose the only record of what was done.
    expect(parentServiceName([], false, "EXION MNRF")).toBe("EXION MNRF");
  });

  it("trims what it joins, so a stray space does not reach the document", () => {
    expect(parentServiceName([{ id: "a", service_name: "  GFC  " }], true, "GFC")).toBe("GFC");
  });
});

describe("linesToWrite", () => {
  it("writes a stored row even once its name has been cleared", () => {
    // Skipping it left the old name in the database, and on the prescription.
    const lines = [{ id: "a", service_name: "" }];
    expect(linesToWrite(lines)).toEqual(lines);
  });

  it("writes stored and named rows", () => {
    const lines = [
      { id: "a", service_name: "HYDRADELUXE" },
      { service_name: "GFC" },
    ];
    expect(linesToWrite(lines)).toEqual(lines);
  });

  it("leaves an untouched empty row out, so saving adds nothing", () => {
    expect(linesToWrite([{ service_name: "" }, { service_name: "   " }])).toEqual([]);
  });
});

describe("matchStoredRows", () => {
  const stored = [
    { id: "row-1", service_name: "HYDRASIGNATURE" },
    { id: "row-2", service_name: "GFC" },
  ];

  it("writes an invented line back to the row it is really about", () => {
    // The line has no id because it was made up from the parent row while the
    // services query answered from a stale cache. Inserting it is what stored
    // HYDRASIGNATURE twice.
    expect(matchStoredRows([{ service_name: "HYDRASIGNATURE" }], stored)).toEqual(["row-1"]);
  });

  it("leaves a line that already knows its own row alone", () => {
    expect(matchStoredRows([{ id: "row-2", service_name: "GFC" }], stored)).toEqual(["row-2"]);
  });

  it("inserts a service the visit does not hold yet", () => {
    expect(matchStoredRows([{ service_name: "EXION MNRF" }], stored)).toEqual([null]);
  });

  it("still lets a doctor list the same service twice", () => {
    expect(
      matchStoredRows(
        [{ service_name: "HYDRASIGNATURE" }, { service_name: "HYDRASIGNATURE" }],
        stored,
      ),
    ).toEqual(["row-1", null]);
  });

  it("does not hand one row to two lines when the first already holds it", () => {
    expect(
      matchStoredRows(
        [{ id: "row-1", service_name: "HYDRASIGNATURE" }, { service_name: "HYDRASIGNATURE" }],
        stored,
      ),
    ).toEqual(["row-1", null]);
  });

  it("reads a name the same however it was typed", () => {
    expect(matchStoredRows([{ service_name: "  hydrasignature " }], stored)).toEqual(["row-1"]);
  });

  it("inserts a nameless line rather than claiming a row at random", () => {
    expect(matchStoredRows([{ service_name: "" }], stored)).toEqual([null]);
  });

  it("inserts everything when the visit holds nothing yet", () => {
    expect(matchStoredRows([{ service_name: "GFC" }], [])).toEqual([null]);
  });
});

describe("namesFromParent", () => {
  it("reads one service as one line", () => {
    expect(namesFromParent("SPOT RESURFX")).toEqual(["SPOT RESURFX"]);
  });

  it("reads a roll-up as a line each", () => {
    expect(namesFromParent("FILLERS, BOTOX")).toEqual(["FILLERS", "BOTOX"]);
  });

  it("collapses a name repeated by the fault this fixes", () => {
    // "SPOT RESURFX, SPOT RESURFX, SPOT RESURFX" is one service written three
    // times, not three treatments - the printed prescription named it thrice.
    expect(namesFromParent("SPOT RESURFX, SPOT RESURFX, SPOT RESURFX")).toEqual(["SPOT RESURFX"]);
    expect(namesFromParent("EXION, exion")).toEqual(["EXION"]);
  });

  it("answers nothing for a visit with no name at all", () => {
    expect(namesFromParent("")).toEqual([]);
    expect(namesFromParent(null)).toEqual([]);
    expect(namesFromParent("  ,  ")).toEqual([]);
  });
});

describe("parentServiceName, once a shown service is removed", () => {
  it("clears the name the removed service came from", () => {
    // The visit had no stored rows - its service was read off this very name.
    // Keeping it meant the service the doctor deleted was drawn again on the
    // next open, and went on printing.
    expect(parentServiceName([], true, "SPOT RESURFX")).toBe("");
  });

  it("still keeps the name of a visit whose services were never touched", () => {
    expect(parentServiceName([], false, "SPOT RESURFX")).toBe("SPOT RESURFX");
  });
});

describe("dedupeByName", () => {
  it("keeps the service the doctor entered, and drops the copy", () => {
    expect(
      dedupeByName([
        { id: "a", service_name: "SCALP BOOSTER" },
        { service_name: "SCALP BOOSTER" },
      ]),
    ).toEqual([{ id: "a", service_name: "SCALP BOOSTER" }]);
  });

  it("reads a name the same however it was typed or spaced", () => {
    expect(dedupeByName([{ service_name: "EXION" }, { service_name: " exion " }])).toEqual([
      { service_name: "EXION" },
    ]);
  });

  it("leaves different services alone", () => {
    const lines = [{ service_name: "FILLERS" }, { service_name: "BOTOX" }];
    expect(dedupeByName(lines)).toEqual(lines);
  });

  it("does not treat two blank lines as the same service", () => {
    // An empty line is a row waiting to be filled in, not a duplicate.
    const lines = [{ service_name: "" }, { service_name: "" }];
    expect(dedupeByName(lines)).toEqual(lines);
  });
});
