import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from "sonner";

/**
 * The two things this component exists to get right.
 *
 * It lives inside a table row that opens an appointment when clicked, and it
 * sits on a column that is blank on plenty of visits.
 */

let written: string[];
let rowClicks: number;

function stubClipboard(impl: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn(impl) },
  });
}

/** Mirrors the real home: a clickable row with the button inside it. */
function Row({ value }: { value: string | null | undefined }) {
  return (
    <tr onClick={() => { rowClicks += 1; }}>
      <td>
        <span>Investigation</span>
        <CopyButton value={value} label="investigation" />
      </td>
    </tr>
  );
}

const renderRow = (value: string | null | undefined) =>
  render(<table><tbody><Row value={value} /></tbody></table>);

const button = () => screen.queryByRole("button", { name: /copy investigation/i });

beforeEach(() => {
  written = [];
  rowClicks = 0;
  vi.clearAllMocks();
  stubClipboard(async (text) => { written.push(text); });
});
afterEach(() => vi.restoreAllMocks());

describe("CopyButton", () => {
  it("puts the value on the clipboard", async () => {
    renderRow("Acne PIH Treatment");
    fireEvent.click(button()!);
    await waitFor(() => expect(written).toEqual(["Acne PIH Treatment"]));
    expect(toast.success).toHaveBeenCalledWith("Investigation copied");
  });

  it("does not open the row it sits in", async () => {
    // The whole row is a link to the appointment. Copying must not navigate.
    renderRow("Acne PIH Treatment");
    fireEvent.click(button()!);
    await waitFor(() => expect(written).toHaveLength(1));
    expect(rowClicks).toBe(0);
  });

  it("leaves the rest of the row clickable", () => {
    renderRow("Acne PIH Treatment");
    fireEvent.click(screen.getByText("Investigation"));
    expect(rowClicks).toBe(1);
  });

  it("shows nothing when there is nothing to copy", () => {
    // Better than a button that copies the "—" the cell displays: that dash
    // gets pasted into the next appointment and nobody notices.
    renderRow("");
    expect(button()).toBeNull();
    renderRow(null);
    expect(button()).toBeNull();
    renderRow("   ");
    expect(button()).toBeNull();
  });

  it("trims what it copies", () => {
    renderRow("  Acne PIH Treatment  ");
    fireEvent.click(button()!);
    return waitFor(() => expect(written).toEqual(["Acne PIH Treatment"]));
  });

  it("confirms visibly once copied", async () => {
    renderRow("Acne PIH Treatment");
    fireEvent.click(button()!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /investigation copied/i })).toBeTruthy(),
    );
  });

  it("says so when the clipboard is refused, rather than showing a tick", async () => {
    // writeText rejects outside a secure context; three of the app's four
    // existing clipboard calls have no catch at all.
    stubClipboard(async () => { throw new Error("denied"); });
    renderRow("Acne PIH Treatment");
    fireEvent.click(button()!);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /investigation copied/i })).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
