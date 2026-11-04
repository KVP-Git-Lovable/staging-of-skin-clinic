import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "./textarea";

/**
 * The browser draws the red underline and the suggestion menu. All the app can
 * do is say that this text should be checked - and say it on the element, so an
 * ancestor (or the frame the app is previewed in) cannot switch it off for
 * everything inside.
 */
describe("Textarea spelling", () => {
  it("asks the browser to check every prose box", () => {
    render(<Textarea aria-label="Symptoms" />);
    expect(screen.getByLabelText("Symptoms")).toHaveAttribute("spellcheck", "true");
  });

  it("turns on a tablet keyboard's own correction and sentence capitals", () => {
    render(<Textarea aria-label="Diagnosis" />);
    const box = screen.getByLabelText("Diagnosis");
    expect(box).toHaveAttribute("autocorrect", "on");
    expect(box).toHaveAttribute("autocapitalize", "sentences");
  });

  it("lets a field that does not want checking say so", () => {
    render(<Textarea aria-label="Reference" spellCheck={false} />);
    expect(screen.getByLabelText("Reference")).toHaveAttribute("spellcheck", "false");
  });
});
