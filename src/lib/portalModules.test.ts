import { readFileSync, readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  PORTAL_MODULES,
  PORTAL_MODULE_GROUPS,
  PORTAL_MODULE_KEYS,
  portalModuleDefaults,
  portalModuleEnabled,
  portalModulesInGroup,
} from "./portalModules";

describe("the portal module registry", () => {
  it("names a column that really exists in portal_settings", () => {
    // A key with no column behind it is a switch that saves nothing. The
    // columns are spread over several migrations, so read them all.
    const sql = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
      .join("\n");
    for (const key of PORTAL_MODULE_KEYS) {
      expect(sql, `no migration ever adds portal_settings.${key}`).toContain(key);
    }
  });

  it("puts every module in a declared group, and no group is empty", () => {
    for (const m of PORTAL_MODULES) {
      expect(PORTAL_MODULE_GROUPS, `${m.key} is in the unknown group "${m.group}"`)
        .toContain(m.group as (typeof PORTAL_MODULE_GROUPS)[number]);
    }
    for (const g of PORTAL_MODULE_GROUPS) {
      expect(portalModulesInGroup(g).length, `the group "${g}" has no modules`).toBeGreaterThan(0);
    }
  });

  it("has no duplicate keys and a description for each", () => {
    expect(new Set(PORTAL_MODULE_KEYS).size).toBe(PORTAL_MODULES.length);
    for (const m of PORTAL_MODULES) {
      expect(m.label.length, `${m.key} has no label`).toBeGreaterThan(0);
      expect(m.description.length, `${m.key} has no description`).toBeGreaterThan(10);
    }
  });
});

/**
 * The whole reason this module exists. The portal used to resolve a flag as
 * `settings[key] !== false`, so a module whose column was absent read as ON.
 * Feedback must read as OFF.
 */
describe("the default when portal_settings says nothing", () => {
  it("leaves Feedback off", () => {
    expect(portalModuleEnabled({}, "feedback_enabled")).toBe(false);
    expect(portalModuleEnabled(null, "feedback_enabled")).toBe(false);
    expect(portalModuleEnabled(undefined, "feedback_enabled")).toBe(false);
  });

  it("is the only module that starts off", () => {
    // If a second one is ever added, this fails rather than letting a module
    // quietly default off and look like a bug in the portal.
    const off = PORTAL_MODULES.filter((m) => !m.defaultOn).map((m) => m.key);
    expect(off).toEqual(["feedback_enabled"]);
  });

  it("keeps the original fourteen on, exactly as the portal had them", () => {
    // These were added to a table that already had a row, so every one of
    // them has read as on since 20260511101803. Changing that would switch
    // parts of the live portal off without anybody asking.
    for (const m of PORTAL_MODULES) {
      if (m.key === "feedback_enabled") continue;
      expect(portalModuleEnabled({}, m.key), `${m.key} no longer defaults on`).toBe(true);
    }
  });
});

describe("portalModuleEnabled", () => {
  it("obeys an explicit value either way", () => {
    expect(portalModuleEnabled({ feedback_enabled: true }, "feedback_enabled")).toBe(true);
    expect(portalModuleEnabled({ bills_enabled: false }, "bills_enabled")).toBe(false);
    expect(portalModuleEnabled({ bills_enabled: true }, "bills_enabled")).toBe(true);
  });

  it("falls back to the default rather than to on, for anything not a boolean", () => {
    // A null column, or a string written by hand. `!== false` called all of
    // these on - including a null feedback_enabled.
    for (const junk of [null, undefined, "", "false", "true", 0, 1, {}]) {
      expect(
        portalModuleEnabled({ feedback_enabled: junk }, "feedback_enabled"),
        `feedback_enabled: ${JSON.stringify(junk)} switched Feedback on`,
      ).toBe(false);
      expect(
        portalModuleEnabled({ bills_enabled: junk }, "bills_enabled"),
        `bills_enabled: ${JSON.stringify(junk)} switched Bills off`,
      ).toBe(true);
    }
  });

  it("reads one module without being confused by another", () => {
    const row = { bills_enabled: false, shop_enabled: true, feedback_enabled: true };
    expect(portalModuleEnabled(row, "bills_enabled")).toBe(false);
    expect(portalModuleEnabled(row, "shop_enabled")).toBe(true);
    expect(portalModuleEnabled(row, "feedback_enabled")).toBe(true);
    expect(portalModuleEnabled(row, "surveys_enabled")).toBe(true);
  });

  it("portalModuleDefaults agrees with the resolver on an empty row", () => {
    const defaults = portalModuleDefaults();
    for (const m of PORTAL_MODULES) {
      expect(defaults[m.key]).toBe(portalModuleEnabled({}, m.key));
    }
  });
});

/**
 * The registry is only worth having if the screens use it. These read the
 * sources, because the pages are large components with no exported seam.
 */
describe("the screens use the registry", () => {
  it("the portal resolves its flags through it, not through `!== false`", () => {
    const portal = readFileSync("src/pages/portal/Portal.tsx", "utf8");
    expect(portal).toContain("portalModuleEnabled");
    expect(portal, "the old blanket-on resolver is still there").not.toMatch(
      /ps\[key\]\s*!==\s*false/,
    );
  });

  it("the admin page offers every module", () => {
    const page = readFileSync("src/pages/admin/PortalModules.tsx", "utf8");
    expect(page).toContain("PORTAL_MODULES");
    // Driven off the registry rather than a second hand-written list, so a
    // new module appears on the page without anybody remembering to add it.
    expect(page, "the admin page hard-codes its own list of keys").not.toContain(
      "surveys_enabled",
    );
  });

  it("the Pharmacy panel knows about Feedback too", () => {
    // That panel keeps its own explicit form object. It is left in place
    // because staff use it, but a module it cannot see is a switch that
    // appears to be missing depending on which screen you opened.
    const pharma = readFileSync("src/pages/Pharma.tsx", "utf8");
    expect(pharma).toContain("feedback_enabled");
  });

  it("is reachable from Admin Home, and routed", () => {
    // Admin Home and the sidebar both read src/lib/adminSections.ts now; the
    // sidebar's Admin group is one link to /admin and lists nothing itself.
    expect(readFileSync("src/lib/adminSections.ts", "utf8")).toContain("/admin/portal-modules");
    expect(readFileSync("src/pages/Admin.tsx", "utf8")).toContain("adminSections");
    expect(readFileSync("src/App.tsx", "utf8")).toContain('path="/admin/portal-modules"');
  });
});

describe("the page is called what it holds", () => {
  // It stopped being only modules when survey configuration moved onto it.
  // Comments stripped: a source assertion that passes on a file's own prose
  // is a trap this project has walked into before.
  const src = (p: string) =>
    readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const PAGE = "src/pages/admin/PortalModules.tsx";

  it("says Patient Portal Configuration where the name is kept", () => {
    // Two places now, not three: the sidebar stopped naming admin pages when
    // its Admin group became one link, and the name lives on ADMIN_LINKS.
    expect(src(PAGE)).toContain(">Patient Portal Configuration</h1>");
    expect(src("src/lib/adminSections.ts")).toContain('title: "Patient Portal Configuration",');
  });

  it("offers the two halves as tabs, modules first", () => {
    const page = src(PAGE);
    expect(page).toContain('<Tabs defaultValue="modules">');
    expect(page).toContain('<TabsTrigger value="modules">Patient Portal Modules</TabsTrigger>');
    expect(page).toContain('<TabsTrigger value="surveys">Surveys Configuration</TabsTrigger>');
  });

  it("puts the surveys inside their own tab, not loose below the switches", () => {
    // The whole point of the change: they were stacked.
    const page = src(PAGE);
    const tab = page.indexOf('<TabsContent value="surveys"');
    expect(tab).toBeGreaterThan(-1);
    expect(page.indexOf("<PortalSurveyConfig />")).toBeGreaterThan(tab);
  });

  it("keeps the switches and their save in the modules tab", () => {
    const page = src(PAGE);
    const modules = page.indexOf('<TabsContent value="modules"');
    const surveys = page.indexOf('<TabsContent value="surveys"');
    for (const inside of ["PORTAL_MODULE_GROUPS.map", "Save changes"]) {
      const at = page.indexOf(inside);
      expect(at).toBeGreaterThan(modules);
      expect(at).toBeLessThan(surveys);
    }
  });
});
