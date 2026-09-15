import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// The mic pulls in the Web Speech API, which jsdom doesn't have.
vi.mock("@/components/shared/MicButton", () => ({ MicButton: () => null }));
// Draft mode never touches Supabase (the query is `enabled: !!procedureId`), but the
// module is imported at load time and would need env vars to construct a client.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ProcedureStickyNotes, type DraftNote } from "./ProcedureStickyNotes";

/** Mirrors how ProcedureFormDialog holds the buffer. */
function Harness({ onChange }: { onChange?: (n: DraftNote[]) => void }) {
  const [notes, setNotes] = useState<DraftNote[]>([]);
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ProcedureStickyNotes
        notes={notes}
        onNotesChange={(next) => { setNotes(next); onChange?.(next); }}
      />
      <output data-testid="buffer">{JSON.stringify(notes)}</output>
    </QueryClientProvider>
  );
}

const buffer = (): DraftNote[] => JSON.parse(screen.getByTestId("buffer").textContent || "[]");
/** Text as rendered on a note card, rather than as a form value. */
const cardText = (text: string | RegExp) => screen.queryAllByText(text, { selector: "p" });
const openComposer = () => fireEvent.click(screen.getByText("Add a note..."));
const type = (placeholder: string, value: string) =>
  fireEvent.change(screen.getByPlaceholderText(placeholder), { target: { value } });

describe("ProcedureStickyNotes - draft mode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tells the user the notes aren't stored yet", () => {
    render(<Harness />);
    expect(screen.getByText("Notes are attached to the procedure when you save it.")).toBeInTheDocument();
  });

  it("keeps a note that was typed but never added (the Save Procedure case)", () => {
    render(<Harness />);
    openComposer();
    type("Title", "Allergy");
    type("Take a note...", "Patient reacts to lidocaine");

    // Never clicked Add - the buffer must already carry it, because clicking
    // "Save Procedure" flushes the buffer as-is.
    const [note] = buffer();
    expect(note.title).toBe("Allergy");
    expect(note.content).toBe("Patient reacts to lidocaine");
    expect(note.key).toBeTruthy();
  });

  it("shows an added note as a card and does not duplicate it while composing", () => {
    render(<Harness />);
    openComposer();
    type("Take a note...", "First note");

    // While the composer is open the entry is buffered but must not also render as a card.
    expect(cardText("First note")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(cardText("First note")).toHaveLength(1);
    expect(screen.getByText("Not saved yet")).toBeInTheDocument();
    expect(buffer()).toHaveLength(1);
  });

  it("discards the in-progress note on Cancel", () => {
    render(<Harness />);
    openComposer();
    type("Take a note...", "Never mind");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(buffer()).toHaveLength(0);
  });

  it("gives each note a stable key so card colours don't reshuffle while editing", () => {
    render(<Harness />);
    openComposer();
    type("Take a note...", "A");
    const keyWhileTyping = buffer()[0].key;
    type("Take a note...", "A longer version of the note");
    expect(buffer()[0].key).toBe(keyWhileTyping);

    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(buffer()[0].key).toBe(keyWhileTyping);
  });

  it("keeps the newest note first, matching the saved view's ordering", () => {
    render(<Harness />);
    for (const text of ["Oldest", "Newest"]) {
      openComposer();
      type("Take a note...", text);
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
    }
    // Buffer stays chronological (that's the insert order); the grid reverses it.
    expect(buffer().map((n) => n.content)).toEqual(["Oldest", "Newest"]);
    const rendered = cardText(/^(Oldest|Newest)$/).map((el) => el.textContent);
    expect(rendered).toEqual(["Newest", "Oldest"]);
  });

  it("edits a note in place and drops it when emptied", () => {
    render(<Harness />);
    openComposer();
    type("Take a note...", "Draft text");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    fireEvent.click(screen.getByText("Draft text"));
    type("Take a note...", "Corrected text");
    // The card commits on blur once focus leaves the whole card.
    fireEvent.blur(screen.getByPlaceholderText("Take a note...").closest("div.space-y-1\\.5")!, { relatedTarget: document.body });
    expect(buffer()[0].content).toBe("Corrected text");

    fireEvent.click(screen.getByText("Corrected text"));
    type("Take a note...", "   ");
    fireEvent.blur(screen.getByPlaceholderText("Take a note...").closest("div.space-y-1\\.5")!, { relatedTarget: document.body });
    expect(buffer()).toHaveLength(0);
  });

  it("removes a note when its delete button is clicked", () => {
    render(<Harness />);
    openComposer();
    type("Take a note...", "Delete me");
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(buffer()).toHaveLength(1);

    // The card's only icon button is the X.
    const card = screen.getByText("Delete me").closest("div.relative")!;
    fireEvent.click(card.querySelector("button")!);
    expect(buffer()).toHaveLength(0);
  });
});
