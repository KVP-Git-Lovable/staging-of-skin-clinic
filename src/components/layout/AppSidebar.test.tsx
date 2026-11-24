import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";

/**
 * The left-hand menu, after Others and Feedback were added.
 *
 * The first test is the one that matters: the clinic asked for the menu
 * regrouped and for nothing else to be affected, so every address the menu
 * offered before this change is listed here by hand and checked to still be
 * offered. A page that quietly stopped being reachable from the menu is the
 * failure this is here to prevent.
 */

/**
 * Mutable so a test can sign in as somebody other than an admin. It starts as
 * an admin with an empty map, which is exactly what useAuth hands an admin -
 * see the convention in src/lib/staffAccess.ts.
 */
let auth: { isAdmin: boolean; permissions: Record<string, { can_view: boolean }> } = {
  isAdmin: true,
  permissions: {},
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth = { isAdmin: true, permissions: {} };
});

/**
 * The 47 addresses the sidebar offered before the regrouping, taken from the
 * file as it stood. Deliberately written out rather than derived from the
 * component: a list read back out of the thing under test proves nothing.
 */
const EVERY_LINK_BEFORE = [
  "/", "/patients", "/appointments", "/procedures", "/billing", "/pharma", "/photos",
  "/assets", "/orders", "/expenses", "/reports", "/report-builder", "/dashboards",
  "/leads", "/campaigns", "/whatsapp-log", "/feedback-rca",
  "/communications/whatsapp", "/communications/voice", "/communications/email",
  "/communications/journeys", "/communications/calendar", "/communications/meta",
  "/communications/meta/connection",
  "/staff", "/attendance", "/leave",
  "/survey-templates", "/all-surveys",
  "/services", "/knowledge", "/vendors", "/category-master", "/tax-master", "/problem-areas",
  // The Admin group was eleven sub-items and is now one link. Each of those
  // urls was removed from this list by hand, after checking it is on
  // ADMIN_LINKS in src/lib/adminSections.ts - which adminSections.test.ts
  // asserts url by url, so they are still reachable, through Admin Home
  // rather than through here. Removed: /validation-rules, /custom-fields,
  // /duplicate-management, /admin/history-tracking,
  // /admin/knowledge-categories, /admin/currency, /admin/portal-modules,
  // /admin/feedback, /admin/attendance, /user-management, /admin/trash.
  "/admin",
  "/trash", "/settings",
];

/** Render at a path so the group covering it opens, and read every link out. */
function sidebarAt(path: string) {
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  );
  const hrefs = () =>
    Array.from(view.container.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")!);
  return { ...view, hrefs };
}

describe("nothing was lost", () => {
  it("still offers every link it offered before the regrouping", () => {
    // Every group open at once is not a state the menu has, so the pages are
    // gathered from one render per group and pooled. /survey-templates is in
    // the list for the group INSIDE Master Data: rendering at /services opens
    // Master Data but leaves Surveys shut, and a shut group is not in the DOM.
    const seen = new Set<string>();
    for (const path of ["/", "/communications/whatsapp", "/feedback-rca", "/staff", "/dashboards", "/services", "/survey-templates", "/admin"]) {
      const { hrefs, unmount } = sidebarAt(path);
      hrefs().forEach((h) => seen.add(h));
      unmount();
    }
    const missing = EVERY_LINK_BEFORE.filter((url) => !seen.has(url));
    expect(missing, `these pages are no longer reachable from the menu: ${missing.join(", ")}`)
      .toEqual([]);
  });

  it("offers no link twice", () => {
    // Moving an entry into a group and forgetting to take it out of the main
    // list would show it in both places.
    const { hrefs } = sidebarAt("/dashboards");
    const all = hrefs();
    expect(all.length, `duplicated: ${all.filter((h, i) => all.indexOf(h) !== i).join(", ")}`)
      .toBe(new Set(all).size);
  });
});

describe("Others", () => {
  it("holds the four occasional pages and nothing else", () => {
    const { hrefs } = sidebarAt("/dashboards");
    const group = screen.getByText("Others").closest("li")!;
    const inside = Array.from(group.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(inside).toEqual(["/dashboards", "/report-builder", "/orders", "/expenses"]);
    // And they are no longer loose in the main list above it.
    expect(hrefs().filter((h) => h === "/expenses")).toHaveLength(1);
  });

  it("opens by itself when you are on one of its pages", () => {
    sidebarAt("/expenses");
    expect(screen.getByText("Expenses")).toBeInTheDocument();
  });

  it("stays shut on an unrelated page", () => {
    sidebarAt("/patients");
    expect(screen.queryByText("Report Builder")).toBeNull();
  });
});

describe("Feedback", () => {
  it("holds All Feedbacks and Root Cause Analysis, in that order", () => {
    sidebarAt("/feedback-rca");
    const group = screen.getByText("Feedback").closest("li")!;
    expect(within(group).getByText("All Feedbacks")).toBeInTheDocument();
    expect(within(group).getByText("Root Cause Analysis")).toBeInTheDocument();
    // All Feedbacks first: it is where every score is read, and the cases
    // below it are what some of those scores turn into.
    const links = Array.from(group.querySelectorAll("a[href]"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/all-feedbacks", "/feedback-rca"]);
  });

  it("opens the group when All Feedbacks is the page", () => {
    sidebarAt("/all-feedbacks");
    const group = screen.getByText("Feedback").closest("li")!;
    expect(within(group).getByText("All Feedbacks")).toBeInTheDocument();
  });

  it("sits directly below WhatsApp Delivery", () => {
    // The clinic asked for it there by name.
    const { container } = sidebarAt("/feedback-rca");
    const text = container.textContent ?? "";
    expect(text.indexOf("WhatsApp Delivery")).toBeGreaterThan(-1);
    expect(text.indexOf("Feedback")).toBeGreaterThan(text.indexOf("WhatsApp Delivery"));
    expect(text.indexOf("Feedback")).toBeLessThan(text.indexOf("Employees"));
  });
});

describe("Surveys moved under Master Data", () => {
  /** The Master Data <li>, which is the whole group including what it contains. */
  const masterGroup = () =>
    screen.getAllByText("Master Data").map((el) => el.closest("li")).find(Boolean)!;

  it("lists both survey pages there", () => {
    sidebarAt("/survey-templates");
    const inside = Array.from(masterGroup().querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(inside).toContain("/survey-templates");
    expect(inside).toContain("/all-surveys");
  });

  it("keeps Surveys inside Master Data rather than a group of its own", () => {
    // What the old wording was really protecting: the two pages were pulled out
    // of the sidebar root once and must not drift back out. They are now one
    // step further in, but still under Master Data and nowhere else.
    sidebarAt("/survey-templates");
    const surveys = screen.getAllByText("Surveys");
    expect(surveys).toHaveLength(1);
    expect(masterGroup().contains(surveys[0])).toBe(true);
  });

  it("shows one line, not two, until Surveys is opened", () => {
    // The point of the change. At /services Master Data is open and Surveys is
    // shut, so neither page is on the menu - that is the congestion removed.
    sidebarAt("/services");
    expect(screen.getByText("Surveys")).toBeInTheDocument();
    const inside = Array.from(masterGroup().querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    expect(inside).not.toContain("/survey-templates");
    expect(inside).not.toContain("/all-surveys");
  });

  it("opens both levels on the page you are already on", () => {
    sidebarAt("/all-surveys");
    const inside = Array.from(masterGroup().querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
    // Master Data opening at all is the flattened path list: the Surveys entry
    // has no url, so a plain .map() would have lost both pages from it.
    expect(inside).toContain("/all-surveys");
    expect(inside).toContain("/survey-templates");
  });

  it("opens a group rather than going somewhere", () => {
    // A trigger rendered as the default anchor would be counted as a page by
    // every test here that reads a[href], and would navigate nowhere.
    sidebarAt("/survey-templates");
    const trigger = screen.getByText("Surveys").closest("button");
    expect(trigger).not.toBeNull();
    expect(trigger!.getAttribute("href")).toBeNull();
  });

  it("hides the whole entry from somebody without the surveys permission", () => {
    auth = {
      isAdmin: false,
      permissions: { services: { can_view: true }, surveys: { can_view: false } },
    };
    sidebarAt("/services");
    expect(screen.queryByText("Surveys")).toBeNull();
    expect(screen.queryByText("Survey Templates")).toBeNull();
    expect(screen.queryByText("All Surveys")).toBeNull();
  });
});

describe("the nested group is wired to its own state", () => {
  it("does not share a collapsible group name with Master Data above it", () => {
    // Both chevrons are rotated by group-data-[state=open]/<name>. One name for
    // both would turn the outer arrow when the inner group opened.
    const src = readFileSync("src/components/layout/AppSidebar.tsx", "utf8")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toContain("group/surveys");
    expect(src).toContain("group-data-[state=open]/surveys:rotate-180");
  });
});

describe("the groups that were not asked about", () => {
  it("Communications Center is untouched", () => {
    sidebarAt("/communications/whatsapp");
    const group = screen.getByText("Communications Center").closest("li")!;
    // 7 in production, plus Agentic Marketing, which exists only in staging.
    expect(group.querySelectorAll("a[href]")).toHaveLength(8);
  });

  it("Employees is untouched", () => {
    sidebarAt("/staff");
    const group = screen.getByText("Employees").closest("li")!;
    expect(group.querySelectorAll("a[href]")).toHaveLength(3);
  });
});

/**
 * The menu after it was made to tell the truth.
 *
 * canView() used to be `return true` with a note saying "for now", so every
 * signed-in person was offered all 47 pages and the route guard then refused
 * most of them. These hold the other direction too: an admin still sees
 * everything, and a role nobody has configured yet is not locked out.
 */
describe("what a therapist sees", () => {
  const therapist = {
    isAdmin: false,
    permissions: {
      dashboard: { can_view: true },
      appointments: { can_view: true },
      attendance: { can_view: true },
    },
  };

  /** Every group opened in turn, so nothing is missed by being collapsed. */
  function allLinksFor(a: typeof therapist) {
    auth = a;
    const seen = new Set<string>();
    for (const path of ["/", "/communications/whatsapp", "/feedback-rca", "/staff", "/dashboards", "/services", "/survey-templates", "/admin"]) {
      const { hrefs, unmount } = sidebarAt(path);
      hrefs().forEach((h) => seen.add(h));
      unmount();
    }
    return seen;
  }

  it("offers the three pages they were given, and the way into them", () => {
    const seen = allLinksFor(therapist);
    for (const url of ["/", "/appointments", "/attendance"]) {
      expect(seen.has(url), `a therapist cannot reach ${url}`).toBe(true);
    }
  });

  it("offers nothing else at all", () => {
    const seen = allLinksFor(therapist);
    // Named rather than counted: a count passes while the wrong pages leak.
    for (const url of [
      "/patients", "/billing", "/pharma", "/photos", "/procedures", "/reports",
      "/staff", "/leave", "/settings", "/user-management", "/admin/attendance",
      "/trash", "/admin/trash", "/expenses", "/leads", "/campaigns",
      "/communications/whatsapp", "/services", "/survey-templates",
    ]) {
      expect(seen.has(url), `a therapist should not be offered ${url}`).toBe(false);
    }
  });

  it("hides the Admin group entirely rather than leaving it empty", () => {
    auth = therapist;
    sidebarAt("/admin");
    expect(screen.queryByText("Administration")).toBeNull();
    expect(screen.queryByText("User Management")).toBeNull();
  });

  it("still shows Employees, because My Attendance lives inside it", () => {
    auth = therapist;
    sidebarAt("/attendance");
    expect(screen.getByText("My Attendance")).toBeInTheDocument();
    expect(screen.queryByText("Staff")).toBeNull();
  });
});

describe("what the gating must never do", () => {
  it("leaves an admin every one of the 38 links", () => {
    // Admins are handled before the map is consulted, and their map is empty.
    auth = { isAdmin: true, permissions: {} };
    const seen = new Set<string>();
    for (const path of ["/", "/communications/whatsapp", "/feedback-rca", "/staff", "/dashboards", "/services", "/survey-templates", "/admin"]) {
      const { hrefs, unmount } = sidebarAt(path);
      hrefs().forEach((h) => seen.add(h));
      unmount();
    }
    const missing = EVERY_LINK_BEFORE.filter((url) => !seen.has(url));
    expect(missing, `an admin lost: ${missing.join(", ")}`).toEqual([]);
  });

  it("leaves a role nobody has configured yet with everything", () => {
    // An empty map for a non-admin means "not set up", and locking those
    // people out of their own clinic on an upgrade is the worse failure.
    auth = { isAdmin: false, permissions: {} };
    const { hrefs } = sidebarAt("/");
    expect(hrefs()).toContain("/patients");
  });

  it("hides a page whose permission is present but switched off", () => {
    auth = { isAdmin: false, permissions: { dashboard: { can_view: true }, patients: { can_view: false } } };
    const { hrefs } = sidebarAt("/");
    expect(hrefs()).not.toContain("/patients");
  });
});

/**
 * The Admin group after it became one link.
 *
 * Its eleven sub-items moved onto Admin Home. /admin is itself guarded by
 * "settings", so the collapse is only safe for somebody holding that key -
 * and these two tests are the pair that proves it both ways.
 */
describe("the Admin group", () => {
  it("is a single link for somebody who can open Admin Home", () => {
    auth = { isAdmin: true, permissions: {} };
    const { hrefs } = sidebarAt("/admin");
    const admin = hrefs().filter((h) => h === "/admin" || h.startsWith("/admin/"));
    expect(admin).toEqual(["/admin"]);
    // The sub-items are gone from the menu, not hidden behind a closed group:
    // rendering AT /admin is what used to open them.
    expect(hrefs()).not.toContain("/user-management");
    expect(hrefs()).not.toContain("/admin/trash");
  });

  it("still offers Attendance directly to somebody who cannot open Admin Home", () => {
    // attendance_admin without settings: /admin/attendance opens for them and
    // /admin does not, so collapsing the group blindly would strand them.
    auth = { isAdmin: false, permissions: { dashboard: { can_view: true }, attendance_admin: { can_view: true } } };
    const { hrefs } = sidebarAt("/admin/attendance");
    expect(hrefs()).toContain("/admin/attendance");
    expect(hrefs()).not.toContain("/admin");
  });

  it("disappears for somebody with neither", () => {
    auth = { isAdmin: false, permissions: { dashboard: { can_view: true }, settings: { can_view: false } } };
    const { hrefs } = sidebarAt("/admin");
    expect(hrefs().filter((h) => h.startsWith("/admin"))).toEqual([]);
  });
});
