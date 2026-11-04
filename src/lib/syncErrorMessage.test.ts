import { describe, it, expect } from "vitest";
import { syncErrorMessage, summariseSyncErrors } from "./syncErrorMessage";

// The real thing, as the clinic saw it in the sync panel.
const MAINTENANCE_PAGE =
  'SF query failed [503]: <html> <body> <center> <table bgcolor="white" cellpadding="0" ' +
  'cellspacing="0" width="758"> <tbody> <tr> <td> <span style="font-family: Verdana; ' +
  'font-size: medium; font-weight: bold;">We are down for maintenance.</span> <br> <br>' +
  "Sorry for the inconvenience. We'll be back shortly.</td> <br> </tr> </tbody> </table> " +
  "</center> </body> </html>";

describe("syncErrorMessage", () => {
  it("replaces the maintenance page with one sentence", () => {
    const message = syncErrorMessage(MAINTENANCE_PAGE);
    expect(message).toContain("Salesforce is temporarily unavailable");
    expect(message).toContain("run the sync again");
  });

  it("leaves no markup behind", () => {
    expect(syncErrorMessage(MAINTENANCE_PAGE)).not.toMatch(/[<>]|bgcolor|cellpadding|font-family/);
  });

  it("says nothing was half-imported, because nothing was", () => {
    // A patient is only marked synced after succeeding, so a failed run leaves
    // no partial state - worth saying, or staff assume the data is now suspect.
    expect(syncErrorMessage(MAINTENANCE_PAGE)).toContain("no patient was marked as synced");
  });

  it("recognises an outage from the status code alone", () => {
    expect(syncErrorMessage("SF query failed [502]: Bad Gateway")).toContain("temporarily unavailable");
    expect(syncErrorMessage("SF query failed [504]: timeout")).toContain("temporarily unavailable");
  });

  it("keeps a real error intact, so it stays diagnosable", () => {
    const real = "sf-import-clinical: invoices insert: null value in column \"total_amount\"";
    expect(syncErrorMessage(real)).toBe(real);
  });

  it("does not mistake an ordinary number for a status code", () => {
    // "503" as a row count is not an outage. Only a status-shaped "[503]" or
    // "HTTP 503" counts, or a real failure gets reported as Salesforce being
    // down and nobody looks at the actual cause.
    const real = "appointments insert: 503 rows rejected by policy";
    expect(syncErrorMessage(real)).toBe(real);
    expect(syncErrorMessage("invoice B-50412 failed to import")).toBe("invoice B-50412 failed to import");
  });

  it("trims something unreasonably long rather than flooding the panel", () => {
    const long = `x${"y".repeat(500)}`;
    const out = syncErrorMessage(long);
    expect(out.length).toBeLessThanOrEqual(201);
    expect(out.endsWith("…")).toBe(true);
  });

  it("has something to say when there is no message at all", () => {
    expect(syncErrorMessage("")).toBe("Sync failed for an unknown reason.");
    expect(syncErrorMessage(null)).toBe("Sync failed for an unknown reason.");
  });
});

describe("summariseSyncErrors", () => {
  it("says it once when every patient failed the same way", () => {
    const out = summariseSyncErrors([MAINTENANCE_PAGE, MAINTENANCE_PAGE, MAINTENANCE_PAGE]);
    expect(out.match(/Salesforce is temporarily unavailable/g)).toHaveLength(1);
  });

  it("keeps two genuinely different failures", () => {
    const out = summariseSyncErrors(["invoices insert: boom", "procedures insert: bang"]);
    expect(out).toContain("invoices insert: boom");
    expect(out).toContain("procedures insert: bang");
  });

  it("ignores patients that did not fail", () => {
    expect(summariseSyncErrors([undefined, null, ""])).toBe("");
  });
});
