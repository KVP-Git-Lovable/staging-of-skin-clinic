import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADMIN_GROUPS,
  ADMIN_LINKS,
  adminGroupsOf,
  matchesAdminSearch,
  visibleAdminLinks,
  type AdminLink,
} from "@/lib/adminSections";

/**
 * The admin pages, and who is offered them.
 *
 * The sidebar's Admin group became one link and these fourteen entries moved
 * onto Admin Home. Two things had to be true for that to be safe, and both
 * are asserted here: nothing was dropped on the way, and a tile cannot offer
 * a page whose route then refuses to open.
 */

const APP = readFileSync("src/App.tsx", "utf8");

/** moduleKey the route guards with, "admin" for AdminRoute, null if unrouted. */
function guardOf(url: string): string | null {
  const line = APP.split("\n").find((l) => l.includes(`path="${url}"`));
  if (!line) return null;
  if (line.includes("<AdminRoute>")) return "admin";
  return /moduleKey="([^"]+)"/.exec(line)?.[1] ?? null;
}

describe("every tile opens the page it offers", () => {
  for (const link of ADMIN_LINKS) {
    it(`${link.title} is guarded the same way its route is`, () => {
      const guard = guardOf(link.url);
      expect(guard, `${link.url} is not routed in App.tsx`).not.toBeNull();
      expect(link.adminOnly ? "admin" : link.moduleKey).toBe(guard);
    });
  }
});

describe("nothing was lost when the sidebar group collapsed", () => {
  it("still lists every url the Admin menu used to", () => {
    // Written out, not derived: the whole point is to catch a quiet drop.
    for (const url of [
      "/validation-rules",
      "/custom-fields",
      "/duplicate-management",
      "/admin/history-tracking",
      "/admin/knowledge-categories",
      "/admin/currency",
      "/admin/portal-modules",
      "/admin/feedback",
      "/admin/attendance",
      "/user-management",
      "/admin/trash",
    ]) {
      expect(ADMIN_LINKS.some((l) => l.url === url), `${url} is no longer reachable`).toBe(true);
    }
  });

  it("keeps the three Admin Home already had", () => {
    for (const url of ["/knowledge", "/admin/photo-fingerprints", "/admin/visits-to-review"]) {
      expect(ADMIN_LINKS.some((l) => l.url === url), `${url} is no longer reachable`).toBe(true);
    }
  });

  it("offers each page once, and files each under a real group", () => {
    const urls = ADMIN_LINKS.map((l) => l.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const l of ADMIN_LINKS) expect(ADMIN_GROUPS).toContain(l.group);
  });

  it("leaves no group empty", () => {
    for (const g of ADMIN_GROUPS) {
      expect(ADMIN_LINKS.some((l) => l.group === g), `${g} has nothing in it`).toBe(true);
    }
  });
});

describe("who is offered what", () => {
  const urls = (links: AdminLink[]) => links.map((l) => l.url);

  it("gives an admin all of them", () => {
    // An admin's permission map is empty by design; admin is checked first.
    expect(visibleAdminLinks({ isAdmin: true, permissions: {} })).toHaveLength(ADMIN_LINKS.length);
  });

  it("does not offer User Management to a non-admin, however much else they hold", () => {
    const seen = urls(
      visibleAdminLinks({
        isAdmin: false,
        permissions: { settings: { can_view: true }, services: { can_view: true } },
      }),
    );
    expect(seen).not.toContain("/user-management");
    expect(seen).toContain("/validation-rules");
  });

  it("gives a settings holder the settings pages but not Attendance", () => {
    // attendance_admin is its own key, and this role does not hold it.
    const seen = urls(
      visibleAdminLinks({ isAdmin: false, permissions: { settings: { can_view: true } } }),
    );
    expect(seen).toContain("/admin/trash");
    expect(seen).not.toContain("/admin/attendance");
    expect(seen).not.toContain("/knowledge");
  });

  it("gives an attendance_admin holder Attendance and nothing else", () => {
    // This is the person the sidebar must keep a direct link for: they can
    // open /admin/attendance but not /admin.
    const seen = urls(
      visibleAdminLinks({ isAdmin: false, permissions: { attendance_admin: { can_view: true } } }),
    );
    expect(seen).toEqual(["/admin/attendance"]);
  });
});

describe("searching for a page", () => {
  const portal = ADMIN_LINKS.find((l) => l.url === "/admin/portal-modules")!;
  const trash = ADMIN_LINKS.find((l) => l.url === "/admin/trash")!;

  it("matches on the title", () => {
    expect(matchesAdminSearch(portal, "portal")).toBe(true);
  });

  it("matches on the description, because that is the word people type", () => {
    // "Attendance" is not what somebody looking for week offs types.
    const attendance = ADMIN_LINKS.find((l) => l.url === "/admin/attendance")!;
    expect(matchesAdminSearch(attendance, "holiday")).toBe(true);
  });

  it("ignores case and surrounding spaces", () => {
    expect(matchesAdminSearch(trash, "  RETAINED ")).toBe(true);
  });

  it("matches everything on a blank box", () => {
    expect(ADMIN_LINKS.every((l) => matchesAdminSearch(l, "   "))).toBe(true);
  });

  it("matches nothing on a word that is not there", () => {
    expect(ADMIN_LINKS.some((l) => matchesAdminSearch(l, "zzzznope"))).toBe(false);
  });

  it("drops a heading once its last tile is filtered away", () => {
    const only = ADMIN_LINKS.filter((l) => l.group === "People");
    expect(adminGroupsOf(only)).toEqual(["People"]);
    expect(adminGroupsOf([])).toEqual([]);
  });

  it("keeps the headings in the order they are declared", () => {
    expect(adminGroupsOf(ADMIN_LINKS)).toEqual([...ADMIN_GROUPS]);
  });
});

describe("the sidebar hands this job over", () => {
  const sidebar = () =>
    readFileSync("src/components/layout/AppSidebar.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("keeps no admin list of its own any more", () => {
    expect(sidebar()).not.toContain("adminSubItems");
  });

  it("reads this list instead", () => {
    const source = sidebar();
    expect(source).toContain('from "@/lib/adminSections"');
    expect(source).toContain("visibleAdminLinks({ isAdmin, permissions })");
  });

  it("only collapses to one link for somebody who can open Admin Home", () => {
    // /admin is guarded by settings; without it the sub-items must stay.
    const source = sidebar();
    expect(source).toContain('const canOpenAdminHome = canView("settings");');
    expect(source).toContain("canOpenAdminHome ? (");
  });
});
