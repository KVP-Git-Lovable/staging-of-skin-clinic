import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * Regression cover for the sign-in path losing every permission when a column the
 * select referenced did not exist yet (data_scope ships with a migration, so there is
 * always a window where the deployed frontend is ahead of the database). PostgREST
 * answers with an error and no row, which the caller cannot tell apart from "this
 * user is not staff" - the user was left with isAdmin false and no permissions, i.e.
 * Access Denied on every module.
 */

const STAFF_ROW = {
  id: "staff-1",
  first_name: "Vindhya",
  last_name: "Pai",
  email: "drvindhyapai@gmail.com",
  phone: null,
  role_id: "role-admin",
  user_roles_config: { id: "role-admin", name: "Admin" },
};

const PERMISSION_ROWS = [
  { module_key: "user_management", can_view: true, can_create: true, can_edit: true, can_delete: true },
];

/** true => user_roles_config selects fail, as they do before the migration lands. */
let dataScopeColumnMissing = true;

function makeThenable(result: unknown) {
  // Every builder method returns the same object, so any chain length resolves.
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit", "update"]) {
    builder[m] = () => builder;
  }
  builder.maybeSingle = () => Promise.resolve(result);
  builder.single = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: () => Promise.resolve({ data: { session: { user: { id: "auth-1", email: STAFF_ROW.email } } } }),
      signOut: () => Promise.resolve({ error: null }),
    },
    from: (table: string) => {
      if (table === "staff") return makeThenable({ data: STAFF_ROW, error: null });
      if (table === "user_roles_config") {
        return dataScopeColumnMissing
          ? makeThenable({ data: null, error: { message: 'column user_roles_config.data_scope does not exist' } })
          : makeThenable({ data: { data_scope: "own" }, error: null });
      }
      if (table === "role_module_permissions") return makeThenable({ data: PERMISSION_ROWS, error: null });
      return makeThenable({ data: null, error: null });
    },
  },
}));

import { AuthProvider, useAuth } from "./useAuth";

function Probe() {
  const { isAdmin, dataScope, staffProfile, permissions } = useAuth();
  return (
    <output data-testid="out">
      {JSON.stringify({
        isAdmin,
        dataScope,
        role: staffProfile?.roleName ?? null,
        canOpenUserManagement: isAdmin || !!permissions.user_management?.can_view,
      })}
    </output>
  );
}

const read = () => JSON.parse(screen.getByTestId("out").textContent || "{}");

describe("useAuth staff profile", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps admin access when the data_scope column does not exist yet", async () => {
    dataScopeColumnMissing = true;
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(read().role).toBe("Admin"));
    const out = read();
    expect(out.isAdmin).toBe(true);
    expect(out.canOpenUserManagement).toBe(true);
    // Unknown scope must fail open, matching public.has_full_data_scope().
    expect(out.dataScope).toBe("all");
  });

  it("applies the role's scope once the column is there", async () => {
    dataScopeColumnMissing = false;
    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(read().dataScope).toBe("own"));
    expect(read().isAdmin).toBe(true);
  });
});
