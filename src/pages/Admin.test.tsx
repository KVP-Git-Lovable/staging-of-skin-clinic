import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Admin from "./Admin";
import { ADMIN_LINKS } from "@/lib/adminSections";

/**
 * Admin Home, now that it is the way in.
 *
 * It used to show every tile to everybody, which was harmless while the
 * sidebar was the real route in and that DID filter by permission. The
 * sidebar's Admin group is one link now, so these tiles are the only way to
 * reach an admin page - and a tile offering a page the route then refuses
 * would be the only thing the clinic sees.
 */

let auth: { isAdmin: boolean; permissions: Record<string, { can_view: boolean }> } = {
  isAdmin: true,
  permissions: {},
};
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));

beforeEach(() => {
  auth = { isAdmin: true, permissions: {} };
});

/** Type into the search box. fireEvent, because the project has no user-event. */
function search(text: string) {
  fireEvent.change(screen.getByLabelText("Search admin settings"), { target: { value: text } });
}

function page() {
  return render(
    <MemoryRouter>
      <Admin />
    </MemoryRouter>,
  );
}

/** Every tile's destination, read out of the rendered page. */
const tiles = () =>
  screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");

describe("who sees which tiles", () => {
  it("shows an admin all of them", () => {
    page();
    expect(tiles()).toHaveLength(ADMIN_LINKS.length);
    expect(tiles()).toContain("/user-management");
  });

  it("does not offer User Management to a non-admin", () => {
    // Its route is AdminRoute, so the tile has to ask isAdmin, not a key.
    auth = { isAdmin: false, permissions: { settings: { can_view: true } } };
    page();
    expect(tiles()).not.toContain("/user-management");
    expect(tiles()).toContain("/validation-rules");
  });

  it("does not offer Attendance to somebody without that key", () => {
    auth = { isAdmin: false, permissions: { settings: { can_view: true } } };
    page();
    expect(tiles()).not.toContain("/admin/attendance");
  });

  it("says so plainly when there is nothing they can open", () => {
    auth = { isAdmin: false, permissions: { settings: { can_view: false } } };
    page();
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText(/no admin pages you can open/i)).toBeInTheDocument();
  });
});

describe("the search box", () => {
  it("narrows to what was typed", () => {
    page();
    search("portal");
    expect(tiles()).toEqual(["/admin/portal-modules"]);
  });

  it("drops the headings that have nothing left under them", () => {
    page();
    expect(screen.getByText("Records & retention")).toBeInTheDocument();
    search("portal");
    expect(screen.queryByText("Records & retention")).toBeNull();
    expect(screen.getByText("Clinic settings")).toBeInTheDocument();
  });

  it("finds a page by what it does, not only by its name", () => {
    // Somebody looking for week offs types "holiday", not "Attendance".
    page();
    search("holiday");
    expect(tiles()).toEqual(["/admin/attendance"]);
  });

  it("gives everything back when the box is cleared", () => {
    page();
    search("portal");
    search("");
    expect(tiles()).toHaveLength(ADMIN_LINKS.length);
  });

  it("says nothing matched rather than showing an empty page", () => {
    page();
    search("zzzznope");
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText(/no admin page matches/i)).toBeInTheDocument();
  });

  it("searches only within what that person may open", () => {
    // A non-admin typing "user" must not be shown User Management.
    auth = { isAdmin: false, permissions: { settings: { can_view: true } } };
    page();
    search("user");
    expect(tiles()).not.toContain("/user-management");
  });
});

describe("the page still reads as it did", () => {
  it("keeps its heading and groups the tiles", () => {
    page();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Admin");
    for (const group of ["Data & customisation", "Clinic settings", "People"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
  });
});
