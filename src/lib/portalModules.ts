/**
 * Which parts of the patient portal the clinic has switched on.
 *
 * The flags themselves are not new: portal_settings has carried a boolean per
 * portal section since 20260511101803, and the patient portal reads them to
 * decide which tabs to show. What was missing was anywhere sensible to find
 * them - the switches live in a tab of the Pharmacy screen called "Customer
 * Portal Configuration", which nothing in Admin or the sidebar links to - and
 * one definition of what the flags ARE. The list was written out twice, by
 * hand, in the editor and in the portal, and the two had already drifted
 * (`appointments_reschedule_enabled` is editable but read nowhere).
 *
 * So: one registry, imported by the admin page and by the portal.
 *
 * ── The default matters ──
 *
 * The portal resolved a flag as `settings[key] !== false`, i.e. anything other
 * than an explicit false means on. That was right for the original fourteen:
 * they were added to a table that already had a row, so every one of them read
 * as on until somebody turned it off, and that is the behaviour the clinic has
 * now.
 *
 * It is wrong for a NEW module. Feedback shows a patient what they said about
 * their visit and lets them change it; it should appear because the clinic
 * decided it should, not because a column was absent. So each module carries
 * its own default and the resolver uses it, which keeps the old fourteen
 * behaving exactly as before while Feedback stays off until it is enabled.
 */

export interface PortalModule {
  /** The boolean column in portal_settings. */
  key: string;
  /** What the switch is called on the admin page. */
  label: string;
  /** The line under it, saying what a patient loses when it is off. */
  description: string;
  /** Heading it sits under on the admin page. */
  group: string;
  /**
   * What the portal does when portal_settings has no value for this key -
   * an older row, or a build that predates the column.
   */
  defaultOn: boolean;
}

export const PORTAL_MODULE_GROUPS = [
  "Appointments",
  "Treatment history",
  "Billing",
  "Shop",
  "Feedback & engagement",
  "Home screen",
] as const;

export const PORTAL_MODULES = [
  {
    key: "appointments_booking_enabled",
    label: "Request an appointment",
    description: "Lets a patient ask for an appointment from the portal. Their existing appointments stay visible either way.",
    group: "Appointments",
    defaultOn: true,
  },
  {
    key: "appointments_reschedule_enabled",
    label: "Cancel or reschedule",
    description:
      "Shows cancel and reschedule controls on a patient's own appointments. Note: the portal does not read this yet \u2014 there are no such controls to show.",
    group: "Appointments",
    defaultOn: true,
  },
  {
    key: "treatment_history_enabled",
    label: "Treatment history",
    description: "Past treatments on the History tab. With both history switches off the tab disappears.",
    group: "Treatment history",
    defaultOn: true,
  },
  {
    key: "procedure_history_enabled",
    label: "Procedure details",
    description: "Procedure records and their prescriptions on the History tab.",
    group: "Treatment history",
    defaultOn: true,
  },
  {
    key: "clinical_photos_enabled",
    label: "Clinical photos",
    description: "The Photos tab, where a patient sees before-and-after pictures from their visits.",
    group: "Treatment history",
    defaultOn: true,
  },
  {
    key: "bills_enabled",
    label: "Bills",
    description: "The Bills tab, with invoices and their PDFs.",
    group: "Billing",
    defaultOn: true,
  },
  {
    key: "outstanding_balance_enabled",
    label: "Outstanding balance",
    description: "Shows what is still owed, on the home screen and on each bill.",
    group: "Billing",
    defaultOn: true,
  },
  {
    key: "shop_enabled",
    label: "Shop",
    description: "The Shop tab, where a patient browses products and places an order.",
    group: "Shop",
    defaultOn: true,
  },
  {
    key: "surveys_enabled",
    label: "Surveys",
    description: "The Surveys tab, where a patient fills in a survey the clinic assigned them.",
    group: "Feedback & engagement",
    defaultOn: true,
  },
  {
    key: "feedback_enabled",
    label: "Feedback",
    description:
      "The Feedback tab, where a patient reads the feedback recorded against their visits and can correct it. Every correction keeps the original answer.",
    group: "Feedback & engagement",
    // Off until the clinic turns it on - see the note at the top of this file.
    defaultOn: false,
  },
  {
    key: "ai_bot_enabled",
    label: "AI assistant",
    description: "The AI Bot tab, which answers questions and can book or reorder for the patient.",
    group: "Feedback & engagement",
    defaultOn: true,
  },
  {
    key: "our_team_enabled",
    label: "Our team",
    description: "The clinic's doctors and staff on the portal home screen.",
    group: "Home screen",
    defaultOn: true,
  },
  {
    key: "clinic_hours_enabled",
    label: "Clinic hours",
    description: "Opening hours on the portal home screen.",
    group: "Home screen",
    defaultOn: true,
  },
  {
    key: "quick_action_request_appointment_enabled",
    label: "Quick action: request appointment",
    description: "The shortcut button on the home screen.",
    group: "Home screen",
    defaultOn: true,
  },
  {
    key: "quick_action_order_medicine_enabled",
    label: "Quick action: order medicine",
    description: "The shortcut button on the home screen.",
    group: "Home screen",
    defaultOn: true,
  },
] as const satisfies readonly PortalModule[];

export type PortalModuleKey = (typeof PORTAL_MODULES)[number]["key"];

export const PORTAL_MODULE_KEYS: readonly PortalModuleKey[] = PORTAL_MODULES.map((m) => m.key);

const BY_KEY = new Map<string, PortalModule>(PORTAL_MODULES.map((m) => [m.key, m]));

/** Settings as they come back from portal_settings - any shape, possibly null. */
export type PortalSettingsRow = Record<string, unknown> | null | undefined;

/**
 * Is this module on?
 *
 * Only an actual boolean in the row counts. Anything else - the key missing,
 * null, a string from a hand-written row - falls back to the module's own
 * default rather than to a blanket "on".
 */
export function portalModuleEnabled(settings: PortalSettingsRow, key: PortalModuleKey): boolean {
  const value = settings ? (settings as Record<string, unknown>)[key] : undefined;
  if (typeof value === "boolean") return value;
  return BY_KEY.get(key)?.defaultOn ?? false;
}

/** Every module's default, for seeding an editor before the row has loaded. */
export function portalModuleDefaults(): Record<PortalModuleKey, boolean> {
  const out = {} as Record<PortalModuleKey, boolean>;
  for (const m of PORTAL_MODULES) out[m.key] = m.defaultOn;
  return out;
}

/** The modules in one group, in registry order. */
export function portalModulesInGroup(group: string): PortalModule[] {
  return PORTAL_MODULES.filter((m) => m.group === group);
}
