import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewPrescriptionButton } from "./ViewPrescriptionButton";

/**
 * The button lives inside a row that opens the visit when clicked, so the only
 * thing that can go wrong here is a click escaping it. It did: closing the
 * preview opened the visit behind it, because a React portal is not where it
 * looks - Radix moves the dialog to the end of the body, but events still
 * travel up the React tree.
 */
const preview = vi.fn();
const close = vi.fn();
let previewState: Record<string, unknown>;

vi.mock("@/hooks/usePrescriptionPreview", () => ({
  usePrescriptionPreview: () => previewState,
}));

beforeEach(() => {
  preview.mockClear();
  close.mockClear();
  previewState = {
    open: false,
    pages: null,
    error: null,
    previewing: false,
    downloading: false,
    preview,
    download: vi.fn(),
    close,
  };
});

/** A row of the patient's Prescriptions tab: clicking it opens the visit. */
function Row({ onRowClick }: { onRowClick: () => void }) {
  return (
    <div onClick={onRowClick} data-testid="row">
      <span>26/08/2026</span>
      <ViewPrescriptionButton procedureId="proc-1" />
    </div>
  );
}

describe("ViewPrescriptionButton", () => {
  it("shows the prescription without opening the visit behind it", () => {
    const onRowClick = vi.fn();
    render(<Row onRowClick={onRowClick} />);

    fireEvent.click(screen.getByLabelText("View prescription"));

    expect(preview).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("closing the preview does not open the visit behind it", () => {
    // The fault as reported: "when we click on that close button or click
    // somewhere outside it takes to other page".
    previewState = { ...previewState, open: true, pages: ["data:image/png;base64,AAA"] };
    const onRowClick = vi.fn();
    render(<Row onRowClick={onRowClick} />);

    const closeButton = screen.getAllByRole("button").find((b) => /close/i.test(b.textContent || b.getAttribute("aria-label") || ""));
    expect(closeButton).toBeTruthy();
    fireEvent.click(closeButton!);

    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("a click anywhere inside the open preview stays inside it", () => {
    previewState = { ...previewState, open: true, pages: ["data:image/png;base64,AAA"] };
    const onRowClick = vi.fn();
    render(<Row onRowClick={onRowClick} />);

    fireEvent.click(screen.getByText("Prescription preview"));
    fireEvent.mouseDown(screen.getByText("Prescription preview"));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});

/**
 * The same button, asked for paper rather than a read.
 *
 * It was reported from the Prescriptions list, where the row offered neither:
 * the front desk had to open the prescription, find the toolbar inside it,
 * preview, and only then print.
 */
describe("ViewPrescriptionButton - printing", () => {
  const rowClick = vi.fn();

  const renderInRow = (action?: "view" | "print") =>
    render(
      <div onClick={rowClick} data-testid="row">
        <ViewPrescriptionButton procedureId="proc-1" action={action} />
      </div>,
    );

  beforeEach(() => rowClick.mockClear());

  it("says it will print, so the two buttons in a row are told apart", () => {
    renderInRow("print");
    expect(screen.getByRole("button", { name: "Print prescription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View prescription" })).toBeNull();
  });

  it("still reads as View when nothing is asked for", () => {
    renderInRow();
    expect(screen.getByRole("button", { name: "View prescription" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print prescription" })).toBeNull();
  });

  // Printing builds the document by the same route as reading it; what differs
  // is only what happens once it is built.
  it("builds the prescription once, without opening the row behind it", () => {
    renderInRow("print");
    fireEvent.click(screen.getByRole("button", { name: "Print prescription" }));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(rowClick).not.toHaveBeenCalled();
  });

  it("carries a label in the wider variant too", () => {
    render(<ViewPrescriptionButton procedureId="proc-1" action="print" variant="full" />);
    expect(screen.getByRole("button", { name: "Print prescription" })).toHaveTextContent(
      "Print prescription",
    );
  });
});
