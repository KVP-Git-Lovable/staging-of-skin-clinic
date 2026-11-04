import { describe, it, expect } from "vitest";
import { tableRowHeight, tableStartSpace } from "./pdfTableLayout";

/** The document's own numbers, so the test fails if the page geometry moves. */
const CONTENT_BOTTOM = 100;
const SERVICE_HEADER = 22;

/** What the drawing code does: break to a new page when this will not fit. */
const fits = (y: number, needed: number) => y - needed >= CONTENT_BOTTOM;

describe("tableRowHeight", () => {
  it("never draws a row shorter than a single line needs", () => {
    expect(tableRowHeight(1, 1, 1)).toBe(25);
    expect(tableRowHeight(0, 0, 0)).toBe(25);
  });

  it("grows with the tallest column, not the sum of them", () => {
    expect(tableRowHeight(1, 11, 1)).toBe(11 * 12 + 9);
    expect(tableRowHeight(11, 1, 1)).toBe(tableRowHeight(1, 11, 1));
  });
});

describe("tableStartSpace", () => {
  it("asks for the first row as well as the heading and column header", () => {
    const firstRow = tableRowHeight(1, 11, 1);
    expect(tableStartSpace(SERVICE_HEADER, firstRow)).toBe(20 + SERVICE_HEADER + firstRow);
  });

  it("asks only for the heading and header when there is no row - as before", () => {
    expect(tableStartSpace(SERVICE_HEADER)).toBe(42);
  });

  it("moves a table whose first row cannot follow its heading", () => {
    // The reported prescription: "Procedure Details" sat low on the page with a
    // HYDRADELUXE row of eleven wrapped lines to follow.
    const y = 230;
    const firstRow = tableRowHeight(1, 11, 1);

    // What it used to reserve - the heading fitted, so it was drawn here...
    expect(fits(y, 42)).toBe(true);
    // ...and then the row did not fit, and went to the next page on its own.
    expect(fits(y - 42, firstRow)).toBe(false);

    // Now the whole table moves together, leaving no empty header behind.
    expect(fits(y, tableStartSpace(SERVICE_HEADER, firstRow))).toBe(false);
  });

  it("leaves a table that does fit exactly where it was", () => {
    const y = 700;
    const firstRow = tableRowHeight(1, 2, 1);
    expect(fits(y, tableStartSpace(SERVICE_HEADER, firstRow))).toBe(true);
  });
});
