import { describe, it, expect } from "vitest";
import { stickyNoteOwner } from "./stickyNoteOwner";

describe("stickyNoteOwner", () => {
  it("sends procedure notes to the procedures table", () => {
    expect(stickyNoteOwner({ procedureId: "proc-1" })).toEqual({
      table: "procedure_sticky_notes",
      column: "procedure_id",
      id: "proc-1",
    });
  });

  it("sends appointment notes to the appointments table", () => {
    expect(stickyNoteOwner({ appointmentId: "appt-1" })).toEqual({
      table: "appointment_sticky_notes",
      column: "appointment_id",
      id: "appt-1",
    });
  });

  it("reports draft mode when there is nothing to save against yet", () => {
    // The New Procedure form composes notes before the procedure exists.
    expect(stickyNoteOwner({})).toBeNull();
    expect(stickyNoteOwner({ procedureId: null, appointmentId: null })).toBeNull();
    expect(stickyNoteOwner({ procedureId: "" })).toBeNull();
    expect(stickyNoteOwner({ procedureId: "   " })).toBeNull();
  });

  it("refuses both at once rather than guessing", () => {
    // Silently preferring one would file a therapist's note against the wrong
    // record, and no caller has a reason to pass both.
    expect(() => stickyNoteOwner({ procedureId: "proc-1", appointmentId: "appt-1" })).toThrow(
      /not both/i,
    );
  });

  it("ignores surrounding whitespace on an id", () => {
    expect(stickyNoteOwner({ appointmentId: "  appt-1  " })?.id).toBe("appt-1");
  });

  it("never returns a table and column that disagree", () => {
    for (const input of [{ procedureId: "a" }, { appointmentId: "b" }]) {
      const owner = stickyNoteOwner(input);
      expect(owner).not.toBeNull();
      // A mismatched pair would write the id into a column of the other table.
      expect(owner!.table.startsWith(owner!.column.replace(/_id$/, ""))).toBe(true);
    }
  });
});
