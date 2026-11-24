import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PatientPreviewDialog from "./PatientPreviewDialog";

/**
 * The duplicate, shown without leaving the form.
 *
 * Everything here is about one property: looking at a suspected duplicate must
 * not cost the receptionist the registration they are halfway through typing.
 */
const PATIENT = {
  id: "11111111-2222-3333-4444-555555555555",
  first_name: "Divyani",
  last_name: "Singh",
  phone: "8618479641",
  alternate_phone: "8762169011",
  email: "d@example.com",
  date_of_birth: "1990-04-12",
  gender: "Female",
  city: "Mangalore",
  status: "Active",
  registered_at: "2026-02-01T00:00:00Z",
  last_visit_date: "2026-10-18",
};

beforeEach(() => vi.restoreAllMocks());

describe("PatientPreviewDialog", () => {
  it("shows both numbers, which is what tells two people on one number apart", () => {
    render(<PatientPreviewDialog patient={PATIENT} onClose={() => {}} />);
    expect(screen.getByText("8618479641")).toBeInTheDocument();
    expect(screen.getByText("8762169011")).toBeInTheDocument();
    expect(screen.getByText(/Divyani Singh/)).toBeInTheDocument();
  });

  it("shows the age beside the date of birth", () => {
    render(<PatientPreviewDialog patient={PATIENT} onClose={() => {}} />);
    expect(screen.getByText(/12 Apr 1990 \(\d+\)/)).toBeInTheDocument();
  });

  it("opens the full record in a NEW TAB, never in this one", () => {
    // A same-tab navigation is the original bug. window.open leaves the form
    // mounted; src/lib/newTab.ts prescribes exactly this for a known URL.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<PatientPreviewDialog patient={PATIENT} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /open full record/i }));
    expect(open).toHaveBeenCalledWith(`/patients/${PATIENT.id}`, "_blank", "noopener,noreferrer");
  });

  it("offers 'This is the patient' only when the caller can act on it", () => {
    const onUseInstead = vi.fn();
    const { rerender } = render(
      <PatientPreviewDialog patient={PATIENT} onClose={() => {}} onUseInstead={onUseInstead} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /this is the patient/i }));
    expect(onUseInstead).toHaveBeenCalledWith(PATIENT);

    // Editing an existing patient: there is no new entry to abandon.
    rerender(<PatientPreviewDialog patient={PATIENT} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /this is the patient/i })).toBeNull();
  });

  it("gets back to the form", () => {
    const onClose = vi.fn();
    render(<PatientPreviewDialog patient={PATIENT} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /back to the form/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing at all when there is nothing to preview", () => {
    const { container } = render(<PatientPreviewDialog patient={null} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a dash for details the clinic never recorded", () => {
    // A blank looks like the dialog failed to load.
    render(
      <PatientPreviewDialog patient={{ id: "p", first_name: "A", phone: "9" }} onClose={() => {}} />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
