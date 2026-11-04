import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";

import { useUrlPanel } from "./useUrlPanel";

function Harness() {
  const { openId, open, close, dismiss } = useUrlPanel("appointment");
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="open">{openId ?? "none"}</span>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="search">{location.search || "(none)"}</span>
      <button onClick={() => open("apt-1")}>open one</button>
      <button onClick={() => open("apt-2")}>open two</button>
      <button onClick={close}>close</button>
      <button onClick={dismiss}>dismiss</button>
      {/* What a link out of the panel does - the Billing tab, a patient link. */}
      <button onClick={() => navigate("/billing?viewInvoice=inv-1")}>leave for billing</button>
      <button onClick={() => navigate(-1)}>browser back</button>
    </div>
  );
}

const renderAt = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Harness />
    </MemoryRouter>,
  );

describe("useUrlPanel", () => {
  it("reads the open record from the address", () => {
    renderAt("/appointments?appointment=apt-9");
    expect(screen.getByTestId("open").textContent).toBe("apt-9");
  });

  it("reports nothing open when the parameter is absent", () => {
    renderAt("/appointments");
    expect(screen.getByTestId("open").textContent).toBe("none");
  });

  it("opening adds the record to the address", () => {
    renderAt("/appointments");
    fireEvent.click(screen.getByText("open one"));
    expect(screen.getByTestId("open").textContent).toBe("apt-1");
    expect(screen.getByTestId("search").textContent).toContain("appointment=apt-1");
  });

  it("keeps the filters already in the address", () => {
    // The whole point: opening a record must not throw away the list's state.
    renderAt("/appointments?status=Confirmed&q=alva");
    fireEvent.click(screen.getByText("open one"));
    const search = screen.getByTestId("search").textContent ?? "";
    expect(search).toContain("status=Confirmed");
    expect(search).toContain("q=alva");
    expect(search).toContain("appointment=apt-1");
  });

  it("closing goes back to the list, filters intact", () => {
    renderAt("/appointments?status=Confirmed");
    fireEvent.click(screen.getByText("open one"));
    fireEvent.click(screen.getByText("close"));

    expect(screen.getByTestId("open").textContent).toBe("none");
    expect(screen.getByTestId("search").textContent).toContain("status=Confirmed");
  });

  it("closing nothing does nothing", () => {
    renderAt("/appointments?status=Confirmed");
    fireEvent.click(screen.getByText("close"));
    expect(screen.getByTestId("search").textContent).toContain("status=Confirmed");
  });

  it("dismiss drops the record without needing history", () => {
    // Used when the record has been deleted - going back would reopen a panel
    // for something that no longer exists.
    renderAt("/appointments?status=Confirmed&appointment=apt-9");
    fireEvent.click(screen.getByText("dismiss"));

    expect(screen.getByTestId("open").textContent).toBe("none");
    expect(screen.getByTestId("search").textContent).toContain("status=Confirmed");
  });

  it("comes back to the open record after a trip to another module", () => {
    // The reported bug: open an appointment, use its Billing tab to reach the
    // Billing module, press Back - and land on the bare list with the
    // appointment gone. It only worked once the panel was in the address AND
    // the sheet stopped closing itself before navigating away, which would
    // have stripped the parameter back out on the way out.
    renderAt("/appointments?status=Confirmed");
    fireEvent.click(screen.getByText("open one"));
    expect(screen.getByTestId("open").textContent).toBe("apt-1");

    fireEvent.click(screen.getByText("leave for billing"));
    expect(screen.getByTestId("path").textContent).toBe("/billing");
    expect(screen.getByTestId("open").textContent).toBe("none");

    fireEvent.click(screen.getByText("browser back"));
    expect(screen.getByTestId("path").textContent).toBe("/appointments");
    expect(screen.getByTestId("open").textContent).toBe("apt-1");
    expect(screen.getByTestId("search").textContent).toContain("status=Confirmed");
  });

  it("a second Back leaves the panel and keeps the list", () => {
    renderAt("/appointments?status=Confirmed");
    fireEvent.click(screen.getByText("open one"));
    fireEvent.click(screen.getByText("leave for billing"));
    fireEvent.click(screen.getByText("browser back"));
    fireEvent.click(screen.getByText("browser back"));

    expect(screen.getByTestId("path").textContent).toBe("/appointments");
    expect(screen.getByTestId("open").textContent).toBe("none");
    expect(screen.getByTestId("search").textContent).toContain("status=Confirmed");
  });
});
