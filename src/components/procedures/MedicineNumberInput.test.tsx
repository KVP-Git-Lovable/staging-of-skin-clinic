import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MedicineNumberInput } from "./MedicineNumberInput";

const box = () => screen.getByLabelText("Medicine number") as HTMLInputElement;

describe("MedicineNumberInput", () => {
  it("shows the medicine's place in the list", () => {
    render(<MedicineNumberInput position={2} onMove={() => {}} />);
    expect(box().value).toBe("2");
  });

  it("moves the medicine when a different number is typed and the box is left", () => {
    const onMove = vi.fn();
    render(<MedicineNumberInput position={3} onMove={onMove} />);
    fireEvent.change(box(), { target: { value: "1" } });
    expect(onMove).not.toHaveBeenCalled(); // not on every keystroke
    fireEvent.blur(box());
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(1);
  });

  it("does not jump while a two-digit number is being typed", () => {
    const onMove = vi.fn();
    render(<MedicineNumberInput position={5} onMove={onMove} />);
    fireEvent.change(box(), { target: { value: "1" } });
    fireEvent.change(box(), { target: { value: "12" } });
    expect(onMove).not.toHaveBeenCalled();
    fireEvent.blur(box());
    expect(onMove).toHaveBeenCalledWith(12);
  });

  it("commits on Enter, and Enter does not submit the surrounding form", () => {
    const onMove = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <MedicineNumberInput position={3} onMove={onMove} />
      </form>,
    );
    fireEvent.change(box(), { target: { value: "2" } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(onMove).toHaveBeenCalledWith(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("puts the old number back when what was typed is not a whole number", () => {
    const onMove = vi.fn();
    render(<MedicineNumberInput position={2} onMove={onMove} />);
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(onMove).not.toHaveBeenCalled();
    expect(box().value).toBe("2");
    fireEvent.change(box(), { target: { value: "0" } });
    fireEvent.blur(box());
    expect(onMove).not.toHaveBeenCalled();
    expect(box().value).toBe("2");
  });

  it("does nothing when the same number is typed back", () => {
    const onMove = vi.fn();
    render(<MedicineNumberInput position={2} onMove={onMove} />);
    fireEvent.change(box(), { target: { value: "2" } });
    fireEvent.blur(box());
    expect(onMove).not.toHaveBeenCalled();
  });

  it("follows the number when another medicine is moved or removed", () => {
    const { rerender } = render(<MedicineNumberInput position={3} onMove={() => {}} />);
    expect(box().value).toBe("3");
    rerender(<MedicineNumberInput position={2} onMove={() => {}} />);
    expect(box().value).toBe("2");
  });
});
