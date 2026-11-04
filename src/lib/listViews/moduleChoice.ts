/**
 * The view you clicked, remembered for as long as you are in the module.
 *
 * A pin says where you land. A click says where you want to be right now, and
 * it has to outlast opening a record - /appointments/:id is its own route, so
 * the list unmounts and remounts every time a doctor opens an appointment and
 * comes back. Forgetting the click there would throw away the view they chose
 * on every single patient.
 *
 * It must NOT outlast leaving the module, which is where this started: the
 * choice used to live in sessionStorage, so one click on All Appointments beat
 * the pin for the rest of the day on a tab the clinic never closes. Dr Punya
 * reported that as her pin not working.
 *
 * So the rule is "until you leave the module", and the signal is which list
 * mounted last. The appointment detail page opens no list, so coming back from
 * a record keeps the choice; opening Patients and returning does not. In
 * memory rather than in any browser storage, which also makes a reload a fresh
 * start - that is what "the pin decides when you open the app" means - and
 * keeps one person's choice off a shared clinic machine's next user.
 */

const choices = new Map<string, string>();

/** The last module whose list was opened, or null before any has been. */
let lastSection: string | null = null;

/**
 * Called when a module's list mounts.
 *
 * If another module has been opened since this one was, the choice made here
 * is stale and is dropped, so the pin decides again.
 */
export function noteModuleOpened(section: string): void {
  if (lastSection !== null && lastSection !== section) choices.delete(section);
  lastSection = section;
}

export function rememberChoice(section: string, id: string | null): void {
  if (id === null) choices.delete(section);
  else choices.set(section, id);
}

export function choiceFor(section: string): string | null {
  return choices.get(section) ?? null;
}

/** Test seam: there is no other way to get back to a clean module. */
export function resetModuleChoices(): void {
  choices.clear();
  lastSection = null;
}
