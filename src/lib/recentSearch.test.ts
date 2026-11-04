import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  readRecentSearches,
  rememberRecentSearch,
  readLastSearch,
  rememberLastSearch,
  forgetLastSearch,
} from "./recentSearch";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe("rememberRecentSearch", () => {
  it("keeps the newest search first", () => {
    rememberRecentSearch("9611425114");
    rememberRecentSearch("Prema Shetty");
    expect(readRecentSearches()).toEqual(["Prema Shetty", "9611425114"]);
  });

  it("moves a repeated search up instead of listing it twice", () => {
    rememberRecentSearch("9611425114");
    rememberRecentSearch("Prema Shetty");
    rememberRecentSearch("9611425114");
    expect(readRecentSearches()).toEqual(["9611425114", "Prema Shetty"]);
  });

  it("treats a different spelling of case as the same search", () => {
    rememberRecentSearch("Prema");
    rememberRecentSearch("prema");
    expect(readRecentSearches()).toEqual(["prema"]);
  });

  it("ignores a single keystroke", () => {
    rememberRecentSearch("9");
    rememberRecentSearch("  ");
    expect(readRecentSearches()).toEqual([]);
  });

  it("keeps six, so the list stays glanceable", () => {
    for (const term of ["one", "two", "three", "four", "five", "six", "seven"]) {
      rememberRecentSearch(term);
    }
    expect(readRecentSearches()).toEqual(["seven", "six", "five", "four", "three", "two"]);
  });

  it("survives storage being unavailable, as in a private window", () => {
    // This runs in the same breath as opening a result: a throw here used to
    // stop the navigation, so clicking a result did nothing at all.
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberRecentSearch("9611425114")).not.toThrow();
    setItem.mockRestore();
  });

  it("reads nothing rather than throwing on a corrupt value", () => {
    localStorage.setItem("globalSearch.recents", "{not json");
    expect(readRecentSearches()).toEqual([]);
  });
});

describe("the box's own text", () => {
  it("comes back after a reload", () => {
    rememberLastSearch("9611425114");
    expect(readLastSearch()).toBe("9611425114");
  });

  it("is cleared by the clear button", () => {
    rememberLastSearch("9611425114");
    forgetLastSearch();
    expect(readLastSearch()).toBe("");
  });

  it("is dropped when the box is emptied by hand", () => {
    rememberLastSearch("9611425114");
    rememberLastSearch("");
    expect(readLastSearch()).toBe("");
  });

  it("reads empty when storage cannot be reached", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readLastSearch()).toBe("");
    getItem.mockRestore();
  });
});
