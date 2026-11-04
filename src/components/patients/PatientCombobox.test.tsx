import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * The live shape: 153 records hold the phone number in the name column, and
 * digits sort before letters, so ordered by first_name they fill the first page
 * several times over. 50 here is enough to fill the page the dropdown shows.
 */
const PHONE_NAMED = Array.from({ length: 50 }, (_, i) => ({
  id: `phone-${i}`,
  first_name: `62822${String(85100 + i)}`,
  last_name: "",
  phone: `62822${String(85100 + i)}`,
}));
const NAMED = Array.from({ length: 450 }, (_, i) => ({
  id: `named-${i}`,
  first_name: "Prema",
  last_name: `Shetty ${i}`,
  phone: `98${String(80000000 + i)}`,
}));
const ALL = [...PHONE_NAMED, ...NAMED];

/** Every [from, to] the component asked the database for. */
let ranges: Array<[number, number]> = [];
/** What a search query resolves with, set per test. */
let searchRows: typeof ALL = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const chain: any = {
        select: () => chain,
        order: () => chain,
        or: () => chain,
        ilike: () => chain,
        eq: () => chain,
        range: (from: number, to: number) => {
          ranges.push([from, to]);
          return Promise.resolve({ data: ALL.slice(from, to + 1), error: null, count: null });
        },
        limit: () => Promise.resolve({ data: searchRows, error: null, count: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
      return chain;
    },
  },
}));

import { PatientCombobox } from "./PatientCombobox";
import { PATIENT_PICKER_FETCH } from "@/lib/patientPickerList";

/**
 * Every patient dropdown in the app opened on a wall of "Unnamed - 6282285155".
 *
 * Two query functions shared one react-query cache key: the real one fetched
 * 500 rows and filtered out the records that carry a phone number instead of a
 * name, and a "warm the cache" prefetch beside it fetched 50 and filtered
 * nothing. The prefetch was issued first, and those 50 rows are exactly the
 * phone-named ones.
 */
describe("PatientCombobox", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    ranges = [];
    searchRows = [];
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const openPicker = async (props: Record<string, unknown> = {}) => {
    const onValueChange = vi.fn();
    render(<PatientCombobox value="" onValueChange={onValueChange} {...props} />, { wrapper });
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Search by name or phone...")).toBeInTheDocument()
    );
    const type = (text: string) =>
      fireEvent.change(screen.getByPlaceholderText("Search by name or phone..."), {
        target: { value: text },
      });
    return { type, onValueChange };
  };

  const rowText = () => screen.queryAllByTestId("patient-row").map((r) => r.textContent || "");

  // The structural guard. This is about which request was MADE, not about which
  // promise won a race, so it cannot flake - and it fails the moment anyone adds
  // a second, shallower copy of the fetch beside the first.
  it("fetches deep enough to clear the phone-named block, and only once", async () => {
    await openPicker();
    await waitFor(() => expect(rowText().length).toBeGreaterThan(0));
    expect(ranges).toEqual([[0, PATIENT_PICKER_FETCH - 1]]);
  });

  it("opens on patients who have a name", async () => {
    await openPicker();
    await waitFor(() => expect(rowText().length).toBeGreaterThan(0));
    expect(rowText().some((t) => t.includes("Unnamed"))).toBe(false);
    expect(rowText()[0]).toContain("Prema Shetty");
  });

  // Nobody became unreachable: the 153 are still found by the number that is
  // sitting in their name, which is how the front desk looks them up.
  it("still finds a phone-named patient by their number", async () => {
    const target = PHONE_NAMED[0];
    searchRows = [target];
    const { type } = await openPicker();
    type(target.phone);
    await waitFor(() => expect(rowText().length).toBe(1));
    expect(rowText()[0]).toBe(`Unnamed — ${target.phone}`);
  });

  it("keeps the excluded patient out of the opening list", async () => {
    await openPicker({ excludeId: NAMED[0].id });
    await waitFor(() => expect(rowText().length).toBeGreaterThan(0));
    expect(rowText()[0]).not.toContain(`Shetty ${0} `);
    expect(rowText().some((t) => t.includes(NAMED[0].phone))).toBe(false);
  });

  // The hole a straight swap would leave: a patient found by typing their own
  // name could still be saved as their own referrer.
  it("keeps the excluded patient out of the search results too", async () => {
    searchRows = [NAMED[0], NAMED[1]];
    const { type } = await openPicker({ excludeId: NAMED[0].id });
    type("Prema");
    await waitFor(() => expect(rowText().length).toBe(1));
    expect(rowText()[0]).toContain(NAMED[1].phone);
  });

  it("reports the chosen patient's id, which is what the column stores", async () => {
    const { onValueChange } = await openPicker();
    await waitFor(() => expect(rowText().length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTestId("patient-row")[0]);
    expect(onValueChange).toHaveBeenCalledWith(NAMED[0].id, expect.objectContaining({ id: NAMED[0].id }));
  });
});
