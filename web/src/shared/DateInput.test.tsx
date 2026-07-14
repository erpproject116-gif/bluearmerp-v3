import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { DateInput } from "./DateInput";

describe("DateInput", () => {
  it("renders a date input with value", () => {
    render(() => <DateInput value="2026-07-14" aria-label="Order date render" />);
    const input = screen.getByLabelText("Order date render") as HTMLInputElement;
    expect(input.type).toBe("date");
    expect(input.value).toBe("2026-07-14");
  });

  it("fires onInput when value changes", async () => {
    const onInput = vi.fn();
    render(() => <DateInput value="2026-07-14" aria-label="Order date change" onInput={onInput} />);
    const input = screen.getByLabelText("Order date change");
    await fireEvent.input(input, { target: { value: "2026-08-01" } });
    expect(onInput).toHaveBeenCalled();
  });

  it("respects disabled", () => {
    render(() => <DateInput value="2026-07-14" aria-label="Order date disabled" disabled />);
    expect(screen.getByLabelText("Order date disabled")).toBeDisabled();
  });
});
