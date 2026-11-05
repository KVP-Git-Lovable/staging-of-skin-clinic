import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

let canSee = true;
vi.mock("@/hooks/useCanSeeBillingAmounts", () => ({
  useCanSeeBillingAmounts: () => canSee,
}));

import { PaymentModeCell } from "./PaymentModeCell";

describe("PaymentModeCell and the billing-amounts switch", () => {
  beforeEach(() => {
    canSee = true;
  });

  it("shows the payment mode and each split's amount to someone who may see billing", () => {
    const { container } = render(
      <PaymentModeCell
        mode="Split"
        splits={[
          { mode: "Card", amount: 26939 },
          { mode: "UPI", amount: 2420 },
        ]}
      />,
    );
    expect(container.textContent).toContain("Card");
    expect(container.textContent).toContain("UPI");
    expect(container.textContent).toMatch(/26,?939/);
  });

  it("shows a single mode as a badge, as before", () => {
    const { container } = render(<PaymentModeCell mode="Cash" />);
    expect(container.textContent).toContain("Cash");
  });

  it("renders nothing at all - no mode, no amount - when billing is hidden", () => {
    canSee = false;
    const split = render(
      <PaymentModeCell
        mode="Split"
        splits={[
          { mode: "Card", amount: 26939 },
          { mode: "UPI", amount: 2420 },
        ]}
      />,
    );
    expect(split.container.textContent).toBe("");
    const single = render(<PaymentModeCell mode="Cash" />);
    expect(single.container.textContent).toBe("");
  });
});
