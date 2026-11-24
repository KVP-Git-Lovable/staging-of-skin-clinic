import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The clinic's shared notebook, beside the bell.
 *
 * It replaces the paper book on the front desk. The two things the book could
 * never do are search, and giving back something crossed out by mistake - so
 * those are what these press hardest on.
 */

interface Row {
  id: string; body: string;
  created_at: string; created_by_name: string | null;
  updated_at: string; updated_by_name: string | null;
  deleted_at: string | null; deleted_by_name: string | null;
}

let rows: Row[] = [];
/** Every write the panel sent, so a hard delete would be impossible to miss. */
const calls: { op: string; values?: Record<string, unknown>; id?: string }[] = [];

const row = (over: Partial<Row>): Row => ({
  id: "n1", body: "a note",
  created_at: "2026-11-23T10:42:00Z", created_by_name: "Akash",
  updated_at: "2026-11-23T10:42:00Z", updated_by_name: null,
  deleted_at: null, deleted_by_name: null, ...over,
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        order: () => ({
          limit: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
      insert: (values: Record<string, unknown>) => {
        calls.push({ op: `insert:${table}`, values });
        rows = [row({ id: `n${rows.length + 1}`, ...values } as Partial<Row>), ...rows];
        return Promise.resolve({ error: null });
      },
      update: (values: Record<string, unknown>) => ({
        eq: (_c: string, id: string) => {
          calls.push({ op: `update:${table}`, values, id });
          rows = rows.map((r) => (r.id === id ? { ...r, ...values } : r));
          return Promise.resolve({ error: null });
        },
      }),
      delete: () => {
        calls.push({ op: `delete:${table}` });
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    staffProfile: { firstName: "Akash", lastName: "Shetty" },
  }),
}));

import { ClinicNotes } from "@/components/layout/ClinicNotes";

function panel() {
  const view = render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ClinicNotes />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  return view;
}

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  rows = [];
  calls.length = 0;
});

describe("writing one down", () => {
  it("saves what was typed, with who wrote it", async () => {
    panel();
    type("New note", "  Dr Vindhya on leave Thursday  ");
    fireEvent.click(screen.getByRole("button", { name: "Save Note" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      op: "insert:clinic_notes",
      values: { body: "Dr Vindhya on leave Thursday", created_by: "user-1", created_by_name: "Akash Shetty" },
    });
  });

  it("will not save a blank line in the book", () => {
    panel();
    type("New note", "    ");
    expect(screen.getByRole("button", { name: "Save Note" })).toBeDisabled();
  });

  it("shows it in the list afterwards", async () => {
    panel();
    type("New note", "Order gloves");
    fireEvent.click(screen.getByRole("button", { name: "Save Note" }));
    expect(await screen.findByText("Order gloves")).toBeInTheDocument();
  });
});

describe("searching, which is the point of it", () => {
  beforeEach(() => {
    rows = [
      row({ id: "n1", body: "Radha Medicals delivery pending", created_by_name: "Akash" }),
      row({ id: "n2", body: "Dr Vindhya on leave Thursday", created_by_name: "Suyog" }),
    ];
  });

  it("finds a note by words in any order", async () => {
    panel();
    expect(await screen.findByText("Radha Medicals delivery pending")).toBeInTheDocument();
    type("Search notes", "pending radha");
    expect(screen.getByText("Radha Medicals delivery pending")).toBeInTheDocument();
    expect(screen.queryByText("Dr Vindhya on leave Thursday")).not.toBeInTheDocument();
    expect(screen.getByText("1 note")).toBeInTheDocument();
  });

  it("finds what somebody wrote by their name", async () => {
    panel();
    await screen.findByText("Dr Vindhya on leave Thursday");
    type("Search notes", "suyog");
    expect(screen.queryByText("Radha Medicals delivery pending")).not.toBeInTheDocument();
  });

  it("says so plainly when nothing matches", async () => {
    panel();
    await screen.findByText("Dr Vindhya on leave Thursday");
    type("Search notes", "gauze");
    expect(screen.getByText("No notes match that")).toBeInTheDocument();
  });

  it("gives everything back when the search is cleared", async () => {
    panel();
    await screen.findByText("Dr Vindhya on leave Thursday");
    type("Search notes", "gauze");
    fireEvent.click(screen.getByLabelText("Clear search"));
    expect(screen.getByText("Dr Vindhya on leave Thursday")).toBeInTheDocument();
  });
});

describe("changing one", () => {
  beforeEach(() => { rows = [row({ id: "n1", body: "Order gloves" })]; });

  it("writes the new wording against the same note", async () => {
    panel();
    await screen.findByText("Order gloves");
    fireEvent.click(screen.getByLabelText("Edit note"));
    type("Edit note", "Order gloves and gauze");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      op: "update:clinic_notes", id: "n1",
      values: { body: "Order gloves and gauze", updated_by_name: "Akash Shetty" },
    });
  });

  it("leaves the note alone if the edit is cancelled", async () => {
    panel();
    await screen.findByText("Order gloves");
    fireEvent.click(screen.getByLabelText("Edit note"));
    type("Edit note", "something else");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls).toHaveLength(0);
    expect(screen.getByText("Order gloves")).toBeInTheDocument();
  });
});

describe("deleting one does not destroy it", () => {
  beforeEach(() => { rows = [row({ id: "n1", body: "Order gloves" })]; });

  it("marks it deleted rather than removing the row", async () => {
    panel();
    await screen.findByText("Order gloves");
    fireEvent.click(screen.getByLabelText("Delete note"));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].op).toBe("update:clinic_notes");
    expect(calls[0].values).toHaveProperty("deleted_at");
    expect(calls.some((c) => c.op.startsWith("delete:"))).toBe(false);
  });

  it("offers it back from the deleted drawer", async () => {
    panel();
    await screen.findByText("Order gloves");
    fireEvent.click(screen.getByLabelText("Delete note"));

    const drawer = await screen.findByRole("button", { name: /Deleted notes \(1\)/ });
    fireEvent.click(drawer);
    expect(screen.getByText("Order gloves")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1].values).toMatchObject({ deleted_at: null });
  });

  it("takes it out of the live list in the meantime", async () => {
    rows = [row({ id: "n1", body: "Order gloves" }), row({ id: "n2", body: "Call Megha back" })];
    panel();
    await screen.findByText("Order gloves");
    fireEvent.click(screen.getAllByLabelText("Delete note")[0]);
    await waitFor(() => expect(screen.queryByText("Order gloves")).not.toBeInTheDocument());
    expect(screen.getByText("Call Megha back")).toBeInTheDocument();
  });

  it("shows no drawer at all when nothing has been deleted", async () => {
    panel();
    await screen.findByText("Order gloves");
    expect(screen.queryByText(/Deleted notes/)).not.toBeInTheDocument();
  });
});

describe("what it says when there is nothing", () => {
  it("invites a first note", async () => {
    panel();
    expect(await screen.findByText("Nothing written yet.")).toBeInTheDocument();
  });

  it("puts the date and the author on each line", async () => {
    rows = [row({ id: "n1", body: "Order gloves", created_by_name: "Akash" })];
    panel();
    const line = await screen.findByText(/· Akash/);
    expect(within(line).queryByText("edited")).not.toBeInTheDocument();
    expect(line.textContent).toMatch(/(Today|Yesterday|\d+ \w{3} \d{4}), \d+:\d\d (am|pm) · Akash/);
  });

  it("marks a note that was changed later", async () => {
    rows = [row({ id: "n1", updated_at: "2026-11-23T11:30:00Z" })];
    panel();
    expect(await screen.findByText(/· edited/)).toBeInTheDocument();
  });
});
