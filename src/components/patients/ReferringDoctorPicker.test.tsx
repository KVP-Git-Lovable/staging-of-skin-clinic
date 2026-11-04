import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const STAFF = [
  { id: "s1", first_name: "Anita", last_name: "Shenoy", role: "Doctor", specialization: "Dermatology" },
];
const EXTERNAL = [
  { id: "e1", name: "Dr. Mariappa", specialization: "General Medicine" },
  { id: "e2", name: "Dr. Rajmani", specialization: null },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: () => {
        const result =
          table === "staff" ? { data: STAFF, error: null } : { data: EXTERNAL, error: null };
        const chain: any = {
          in: () => chain,
          eq: () => chain,
          order: () => Promise.resolve(result),
        };
        return chain;
      },
    }),
  },
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { ReferringDoctorPicker } from "./ReferringDoctorPicker";

/**
 * The picker the Add form kept to itself, which is why the Details tab offered
 * a text box for the same field.
 *
 * The search was written against first_name/last_name, which only a staff
 * doctor has. An external doctor carries a single `name`, so searching for one
 * compared against "undefined undefined" and found nobody - all four of the
 * clinic's external doctors were unreachable except by scrolling.
 */
describe("ReferringDoctorPicker", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const open = async (value: string | null = null, onChange = vi.fn()) => {
    render(<ReferringDoctorPicker value={value} onChange={onChange} />, { wrapper });
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => expect(screen.getByPlaceholderText("Search doctors...")).toBeInTheDocument());
    const search = () => screen.getByPlaceholderText("Search doctors...") as HTMLInputElement;
    const type = (text: string) => fireEvent.change(search(), { target: { value: text } });
    return { type, onChange };
  };

  it("lists internal and external doctors together", async () => {
    await open();
    await waitFor(() => expect(screen.getByText("Anita Shenoy")).toBeInTheDocument());
    expect(screen.getByText("Dr. Mariappa")).toBeInTheDocument();
    expect(screen.getByText("Dr. Rajmani")).toBeInTheDocument();
  });

  it("finds an external doctor by name", async () => {
    const { type } = await open();
    await waitFor(() => expect(screen.getByText("Dr. Mariappa")).toBeInTheDocument());
    type("mariappa");
    await waitFor(() => expect(screen.getByText("Dr. Mariappa")).toBeInTheDocument());
    expect(screen.queryByText("Dr. Rajmani")).not.toBeInTheDocument();
    expect(screen.queryByText("Anita Shenoy")).not.toBeInTheDocument();
  });

  it("finds a staff doctor by name", async () => {
    const { type } = await open();
    await waitFor(() => expect(screen.getByText("Anita Shenoy")).toBeInTheDocument());
    type("shenoy");
    await waitFor(() => expect(screen.getByText("Anita Shenoy")).toBeInTheDocument());
    expect(screen.queryByText("Dr. Mariappa")).not.toBeInTheDocument();
  });

  it("reports the chosen doctor's name, which is what the column stores", async () => {
    const { onChange } = await open();
    await waitFor(() => expect(screen.getByText("Dr. Mariappa")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Dr. Mariappa"));
    expect(onChange).toHaveBeenCalledWith("Dr. Mariappa");
  });

  it("shows the stored name on the trigger", async () => {
    render(<ReferringDoctorPicker value="Dr. Rajmani" onChange={vi.fn()} />, { wrapper });
    expect(screen.getByRole("combobox")).toHaveTextContent("Dr. Rajmani");
  });
});
