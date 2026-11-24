import { readFileSync } from "node:fs";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const navigate = vi.fn();
vi.mock("react-router-dom", () => ({ useNavigate: () => navigate }));
// The band only asks the schema for a field's label.
vi.mock("@/lib/validation/schema", () => ({
  getObject: () => ({ fields: [{ key: "phone", label: "Phone" }] }),
}));

import DuplicateNotificationBand from "./DuplicateNotificationBand";

/**
 * The band that appears mid-registration when a patient looks like one the
 * clinic already has.
 *
 * Its open-record button used to be a bare navigate. On the Add Patient form
 * that unmounted the route, the page, the dialog and every field the
 * receptionist had typed - and nothing in the app failed, because nothing
 * tested it. These are that test.
 */
const match = (record: Record<string, unknown>, actions: { key: string; label: string }[]) => [
  {
    record,
    rule: { id: "r1", actions },
    matchedFields: [{ id: "f1", field_key: "phone" }],
    message: "A similar record already exists",
    title: "Possible duplicate found",
  },
] as never;

const PATIENT = { id: "p-1", first_name: "Nisha", last_name: "Rai", phone: "9663438657" };
const OPEN = [{ key: "open_record", label: "Open record" }];
const MERGE = [{ key: "merge", label: "Merge" }];

beforeEach(() => navigate.mockReset());

describe("opening the duplicate", () => {
  it("does NOT navigate when the form offers to show it in place", () => {
    // The bug, stated as code. A navigate here destroys the half-typed
    // registration behind this band.
    const onOpenRecord = vi.fn();
    render(
      <DuplicateNotificationBand matches={match(PATIENT, OPEN)} objectKey="patients" onOpenRecord={onOpenRecord} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open record/i }));
    expect(onOpenRecord).toHaveBeenCalledWith(PATIENT);
    expect(navigate, "the band navigated away and took the form with it").not.toHaveBeenCalled();
  });

  it("still navigates for a caller that has nothing to lose", () => {
    // Unchanged default, so adding the prop did not alter any other screen.
    render(<DuplicateNotificationBand matches={match(PATIENT, OPEN)} objectKey="patients" />);
    fireEvent.click(screen.getByRole("button", { name: /open record/i }));
    expect(navigate).toHaveBeenCalledWith("/patients/p-1");
  });
});

describe("the merge slot", () => {
  it("offers Merge when a saved record exists to merge into", () => {
    const onResolve = vi.fn();
    render(<DuplicateNotificationBand matches={match(PATIENT, MERGE)} objectKey="patients" onResolve={onResolve} />);
    fireEvent.click(screen.getByRole("button", { name: /merge/i }));
    expect(onResolve).toHaveBeenCalledWith(PATIENT);
  });

  it("offers 'Use this patient instead' while registering somebody new", () => {
    // Merge rendered a button here that could never open: the resolve dialog
    // is mounted with `!!patient`, and there is no saved patient yet while
    // adding one. The slot now carries the action that can actually work.
    const onUseInstead = vi.fn();
    render(
      <DuplicateNotificationBand matches={match(PATIENT, MERGE)} objectKey="patients" onUseInstead={onUseInstead} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /use this patient instead/i }));
    expect(onUseInstead).toHaveBeenCalledWith(PATIENT);
  });

  it("shows no merge button at all when neither handler is given", () => {
    render(<DuplicateNotificationBand matches={match(PATIENT, MERGE)} objectKey="patients" />);
    expect(screen.queryByRole("button", { name: /merge|use this patient/i })).toBeNull();
  });
});

/**
 * How the Add Patient form wires the band.
 *
 * Asserted against the source rather than by mounting PatientFormSheet, which
 * is ~700 lines over Supabase, react-query and a dozen pickers. Mounting all
 * of that to check four props would be slow and brittle in a way that invites
 * someone to delete it.
 */
describe("the Add Patient form's wiring", () => {
  const form = () =>
    readFileSync("src/components/patients/PatientFormSheet.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("hands the band somewhere to show the match instead of navigating", () => {
    expect(form()).toMatch(/onOpenRecord=\{\(rec\) => setPreviewing\(rec as [^)]*PreviewPatient\)\}/);
  });

  it("offers merge only when editing, and use-instead only when adding", () => {
    const text = form();
    expect(text).toContain("onResolve={isEditing ? (rec) => setResolveWith(rec) : undefined}");
    expect(text).toContain("onUseInstead={isEditing ? undefined : useExistingInstead}");
  });

  it("guards the dialog's own close, and only that one", () => {
    const text = form();
    // Escape, the overlay and the X all come through the Dialog.
    expect(text).toContain("<Dialog open={open} onOpenChange={requestClose}>");
    // ...while a successful save closes through the prop directly, so saving
    // never asks whether to discard what it just saved.
    expect(text).toMatch(/onSuccess\([^)]*\);\s*\n\s*onOpenChange\(false\);/);
  });

  it("binds navigate from the router rather than trusting a global", () => {
    // `navigate` was used here with no import and typecheck did not complain -
    // it resolved to an ambient global and would have thrown in the browser.
    const text = form();
    expect(text).toContain('import { useNavigate } from "react-router-dom"');
    expect(text).toContain("const navigate = useNavigate();");
  });
});
