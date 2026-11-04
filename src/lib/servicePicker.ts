/**
 * How a prescription's service line opens in the service picker.
 *
 * The saved-prescription editor used to hold a free text box beside a dropdown,
 * while the new-prescription form used a searchable dropdown with an "Others"
 * escape hatch. The clinic asked for one picker - the dropdown - on both.
 *
 * Swapping a text box for a dropdown is where data gets lost: thousands of
 * imported prescriptions carry service names the Service Master never had, and
 * a picker that cannot show them would blank the line on the next save. So the
 * rule is: a name that is not in the master is not an error, it is an "Others"
 * line, shown as written and still editable.
 */

import { OTHERS_VALUE } from "@/lib/othersOption";

export interface ServiceOption {
  id: string;
  name?: string | null;
}

export interface ServicePickerState {
  /** What the closed dropdown reads; empty means "Select service". */
  label: string;
  /** The row to tick in the list - a master id, OTHERS_VALUE, or nothing. */
  selectedId: string | null;
  /** Whether to offer the free text box under the dropdown. */
  showNameInput: boolean;
}

const clean = (value: string | null | undefined) => (value || "").trim();

export function servicePickerState(
  serviceId: string | null | undefined,
  serviceName: string | null | undefined,
  services: ServiceOption[] | null | undefined,
): ServicePickerState {
  const list = services || [];
  const id = clean(serviceId);
  const name = clean(serviceName);

  // Chosen by hand, so it stays chosen even once the master loads and even if
  // the typed name happens to match a service.
  if (id === OTHERS_VALUE) {
    return { label: name, selectedId: OTHERS_VALUE, showNameInput: true };
  }

  // The master is still loading. Show what is recorded and no text box - a box
  // that appears for a moment and then vanishes reads like a fault.
  if (list.length === 0) {
    return { label: name, selectedId: id || null, showNameInput: false };
  }

  if (id) {
    const byId = list.find((s) => s.id === id);
    if (byId) return { label: clean(byId.name) || name, selectedId: byId.id, showNameInput: false };
    // An id the master no longer has - the service was removed or renamed away.
    // The recorded name is all that is left of it, so it is kept, not dropped.
    return { label: name, selectedId: null, showNameInput: true };
  }

  if (name) {
    const byName = list.find((s) => clean(s.name).toLowerCase() === name.toLowerCase());
    if (byName) return { label: clean(byName.name) || name, selectedId: byName.id, showNameInput: false };
    // Salesforce-era name. Treated as Others so it shows, and can be corrected.
    return { label: name, selectedId: OTHERS_VALUE, showNameInput: true };
  }

  // A fresh, empty line: the dropdown alone, exactly as the new-prescription
  // form has always opened.
  return { label: "", selectedId: null, showNameInput: false };
}
