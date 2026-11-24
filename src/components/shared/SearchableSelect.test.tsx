import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

/**
 * A long option name must stay inside its own box.
 *
 * "Skin Prep & Priming Formulas" ran out of the Category dropdown on
 * Knowledge Articles and sat across the Status dropdown beside it. The
 * button carries `whitespace-nowrap` and nothing that clips, so as a bare
 * text node the name could neither wrap nor be cut.
 *
 * jsdom lays nothing out, so overflow itself cannot be measured here - the
 * classes that prevent it are the testable part, and a browser check went
 * with them.
 */

// jsdom has neither, and the popover's list needs both to open.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {} unobserve() {} disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
});

const OPTIONS = [
  { id: "c1", name: "Skin Prep & Priming Formulas" },
  { id: "c2", name: "Clinical Protocols & Technique Guidelines" },
  { id: "c3", name: "Aftercare" },
];

const trigger = () => screen.getByRole("combobox");

function select(props: Partial<Parameters<typeof SearchableSelect>[0]> = {}) {
  const onChange = vi.fn();
  render(<SearchableSelect value="c1" onChange={onChange} options={OPTIONS} {...props} />);
  return onChange;
}

describe("a name longer than the box", () => {
  it("is held in something that can shrink and be cut", () => {
    select();
    const label = screen.getByText("Skin Prep & Priming Formulas");
    // min-w-0 is the part that actually fixes it: without it a flex child
    // refuses to shrink below its own content and truncate clips nothing.
    expect(label).toHaveClass("min-w-0");
    expect(label).toHaveClass("truncate");
    expect(label).toHaveClass("flex-1");
  });

  it("reads from the left rather than centring itself", () => {
    select();
    expect(screen.getByText("Skin Prep & Priming Formulas")).toHaveClass("text-left");
  });

  it("never squeezes the chevron to make room", () => {
    const { container } = render(
      <SearchableSelect value="c2" onChange={() => {}} options={OPTIONS} />,
    );
    const chevron = container.querySelector("svg");
    expect(chevron).not.toBeNull();
    expect(chevron).toHaveClass("shrink-0");
  });
});

describe("what it still does", () => {
  it("shows the selected option's name", () => {
    select({ value: "c2" });
    expect(screen.getByText("Clinical Protocols & Technique Guidelines")).toBeInTheDocument();
  });

  it("shows a muted placeholder when nothing is selected", () => {
    select({ value: "", placeholder: "All categories" });
    const placeholder = screen.getByText("All categories");
    expect(placeholder).toBeInTheDocument();
    expect(placeholder).toHaveClass("text-muted-foreground");
  });

  it("still hands back the id when an option is chosen", () => {
    const onChange = select({ value: "" });
    fireEvent.click(trigger());
    fireEvent.click(screen.getByText("Aftercare"));
    expect(onChange).toHaveBeenCalledWith("c3");
  });

  it("closes once something is chosen", () => {
    select({ value: "" });
    fireEvent.click(trigger());
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByText("Aftercare"));
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
  });
});
