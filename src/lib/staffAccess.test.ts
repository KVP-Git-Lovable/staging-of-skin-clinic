import { describe, it, expect } from "vitest";
import { staffAccess } from "./staffAccess";

const base = {
  hasSession: true,
  isStaff: true,
  staffDeactivated: false,
  isAdmin: false,
  permissions: {},
  moduleKey: "patients",
};

describe("staffAccess", () => {
  it("sends a signed-out visitor to sign in", () => {
    expect(staffAccess({ ...base, hasSession: false, isStaff: false })).toBe("sign_in");
  });

  it("blocks a signed-in account that is not clinic staff, even with no permissions loaded", () => {
    expect(staffAccess({ ...base, isStaff: false })).toBe("not_staff");
  });

  it("blocks a deactivated staff member", () => {
    expect(staffAccess({ ...base, staffDeactivated: true })).toBe("deactivated");
  });

  it("lets staff in when their role can view the module", () => {
    expect(staffAccess({ ...base, permissions: { patients: { can_view: true } } })).toBe("allowed");
  });

  it("denies staff whose role cannot view the module", () => {
    expect(staffAccess({ ...base, permissions: { billing: { can_view: true } } })).toBe("denied");
  });
});
