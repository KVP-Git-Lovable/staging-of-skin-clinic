import { describe, it, expect, beforeEach } from "vitest";
import { choiceFor, noteModuleOpened, rememberChoice, resetModuleChoices } from "./moduleChoice";

beforeEach(() => resetModuleChoices());

describe("the view you clicked", () => {
  it("is nothing until something is clicked", () => {
    noteModuleOpened("appointments");
    expect(choiceFor("appointments")).toBeNull();
  });

  it("survives opening a record and coming back", () => {
    // /appointments/:id is its own route, so the list unmounts and mounts
    // again - but no other module's list opens in between.
    noteModuleOpened("appointments");
    rememberChoice("appointments", "view-1");
    noteModuleOpened("appointments");
    expect(choiceFor("appointments")).toBe("view-1");
  });

  it("is dropped once another module has been opened, so the pin decides again", () => {
    noteModuleOpened("appointments");
    rememberChoice("appointments", "view-1");
    noteModuleOpened("patients");
    noteModuleOpened("appointments");
    expect(choiceFor("appointments")).toBeNull();
  });

  it("does not let one module's visit clear another's choice until it is returned to", () => {
    noteModuleOpened("appointments");
    rememberChoice("appointments", "view-1");
    noteModuleOpened("patients");
    rememberChoice("patients", "view-2");
    // Appointments' choice is cleared when appointments is next opened, not
    // while the user is somewhere else.
    expect(choiceFor("patients")).toBe("view-2");
    noteModuleOpened("appointments");
    expect(choiceFor("appointments")).toBeNull();
    expect(choiceFor("patients")).toBe("view-2");
  });

  it("can be cleared outright, for a view that no longer resolves", () => {
    noteModuleOpened("appointments");
    rememberChoice("appointments", "view-gone");
    rememberChoice("appointments", null);
    expect(choiceFor("appointments")).toBeNull();
  });

  it("replaces the previous choice rather than stacking", () => {
    noteModuleOpened("billing");
    rememberChoice("billing", "view-1");
    rememberChoice("billing", "view-2");
    expect(choiceFor("billing")).toBe("view-2");
  });
});
