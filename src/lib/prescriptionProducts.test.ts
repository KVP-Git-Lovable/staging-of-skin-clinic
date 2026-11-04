import { describe, it, expect } from "vitest";
import { OTHERS_VALUE } from "@/lib/othersOption";
import {
  droppedMedicineNotice,
  knownProductIds,
  losesCatalogueLink,
  productIdForSave,
} from "./prescriptionProducts";

const CATALOGUE = knownProductIds([
  { id: "e7f4f21c-bd10-4dc3-b53f-cf56cdaf737f" },
  { id: "46e15448-7db4-4309-b505-8f90b0eb2b2f" },
]);

/** A well-formed id that is simply not in the catalogue any more. */
const REMOVED = "b2fc5a37-85a8-420d-b054-cd09c7dacd4c";

describe("productIdForSave", () => {
  it("keeps a medicine that is in the catalogue", () => {
    expect(productIdForSave("e7f4f21c-bd10-4dc3-b53f-cf56cdaf737f", CATALOGUE)).toBe(
      "e7f4f21c-bd10-4dc3-b53f-cf56cdaf737f",
    );
  });

  it("drops an id the catalogue no longer has, rather than letting the save fail", () => {
    expect(productIdForSave(REMOVED, CATALOGUE)).toBeNull();
  });

  it("drops the Others sentinel, which was never a product id", () => {
    expect(productIdForSave(OTHERS_VALUE, CATALOGUE)).toBeNull();
  });

  it("drops an empty picker", () => {
    expect(productIdForSave("", CATALOGUE)).toBeNull();
    expect(productIdForSave(null, CATALOGUE)).toBeNull();
    expect(productIdForSave(undefined, CATALOGUE)).toBeNull();
    expect(productIdForSave("   ", CATALOGUE)).toBeNull();
  });

  it("drops everything when the catalogue has not loaded, so a save still goes through", () => {
    // An empty list means the lookup failed or is still in flight. Sending the
    // ids anyway is the case that broke; saving the names is not.
    expect(productIdForSave("e7f4f21c-bd10-4dc3-b53f-cf56cdaf737f", knownProductIds([]))).toBeNull();
  });
});

describe("losesCatalogueLink", () => {
  it("is true only for a real id that has gone", () => {
    expect(losesCatalogueLink(REMOVED, CATALOGUE)).toBe(true);
  });

  it("is false for rows that were never linked to the catalogue", () => {
    expect(losesCatalogueLink(OTHERS_VALUE, CATALOGUE)).toBe(false);
    expect(losesCatalogueLink("", CATALOGUE)).toBe(false);
    expect(losesCatalogueLink(null, CATALOGUE)).toBe(false);
  });

  it("is false for a medicine still in the catalogue", () => {
    expect(losesCatalogueLink("46e15448-7db4-4309-b505-8f90b0eb2b2f", CATALOGUE)).toBe(false);
  });
});

describe("droppedMedicineNotice", () => {
  it("names the one medicine that lost its link", () => {
    expect(droppedMedicineNotice(["Tab. Finax"])).toBe(
      "Tab. Finax is no longer in the pharmacy list, so it was saved as typed text.",
    );
  });

  it("lists several", () => {
    expect(droppedMedicineNotice(["Tab. Finax", "Venusia Acne facewash"])).toBe(
      "These are no longer in the pharmacy list, so they were saved as typed text: Tab. Finax, Venusia Acne facewash.",
    );
  });

  it("says nothing when nothing was dropped", () => {
    expect(droppedMedicineNotice([])).toBeNull();
    expect(droppedMedicineNotice(["", "  "])).toBeNull();
  });
});
