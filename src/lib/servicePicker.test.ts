import { describe, it, expect } from "vitest";
import { servicePickerState } from "./servicePicker";
import { OTHERS_VALUE } from "./othersOption";

const MASTER = [
  { id: "svc-1", name: "HYDRADELUXE" },
  { id: "svc-2", name: "Consultation" },
];

describe("servicePickerState", () => {
  it("shows a master service as chosen, with no text box", () => {
    expect(servicePickerState("svc-1", "HYDRADELUXE", MASTER)).toEqual({
      label: "HYDRADELUXE",
      selectedId: "svc-1",
      showNameInput: false,
    });
  });

  it("keeps a Salesforce-era name the master never had, rather than blanking the line", () => {
    const state = servicePickerState(null, "GLUTATHIONE DRIP 2019", MASTER);
    expect(state.label).toBe("GLUTATHIONE DRIP 2019");
    expect(state.showNameInput).toBe(true);
    expect(state.selectedId).toBe(OTHERS_VALUE);
  });

  it("keeps the name when the service has since been removed from the master", () => {
    const state = servicePickerState("svc-gone", "Old peel", MASTER);
    expect(state.label).toBe("Old peel");
    expect(state.showNameInput).toBe(true);
  });

  it("matches by name when the line records no service id", () => {
    expect(servicePickerState(null, "Consultation", MASTER)).toEqual({
      label: "Consultation",
      selectedId: "svc-2",
      showNameInput: false,
    });
  });

  it("takes the master's own spelling once matched, so the two screens read alike", () => {
    expect(servicePickerState(null, "  consultation  ", MASTER).label).toBe("Consultation");
  });

  it("opens a fresh line as the dropdown alone", () => {
    expect(servicePickerState(null, "", MASTER)).toEqual({
      label: "",
      selectedId: null,
      showNameInput: false,
    });
    expect(servicePickerState("", null, MASTER).showNameInput).toBe(false);
  });

  it("respects Others chosen by hand, even when the typed name matches a service", () => {
    const state = servicePickerState(OTHERS_VALUE, "Consultation", MASTER);
    expect(state.selectedId).toBe(OTHERS_VALUE);
    expect(state.showNameInput).toBe(true);
    expect(state.label).toBe("Consultation");
  });

  it("does not flash a text box while the master is still loading", () => {
    // The list arrives a moment after the prescription does. A box that appears
    // and then disappears reads like a fault.
    const state = servicePickerState(null, "HYDRADELUXE", []);
    expect(state.showNameInput).toBe(false);
    expect(state.label).toBe("HYDRADELUXE");
    expect(servicePickerState(null, "HYDRADELUXE", null).showNameInput).toBe(false);
  });
});
