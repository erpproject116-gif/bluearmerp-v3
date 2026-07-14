import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { DecimalInput } from "./DecimalInput";

describe("DecimalInput", () => {
  it("accepts decimal input in decimal mode", async () => {
    const onValue = vi.fn();
    render(() => (
      <label>
        Amount
        <DecimalInput value="" onValue={onValue} />
      </label>
    ));
    const input = screen.getByLabelText("Amount");
    await fireEvent.input(input, { target: { value: "12.5" } });
    expect(onValue).toHaveBeenCalled();
  });

  it("sanitizes to integers in integer mode", async () => {
    function Harness() {
      const [v, setV] = createSignal("");
      return (
        <label>
          Count
          <DecimalInput value={v()} onValue={setV} mode="integer" />
        </label>
      );
    }
    render(() => <Harness />);
    const input = screen.getByLabelText("Count") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "12a3" } });
    expect(input.value).toMatch(/^\d*$/);
  });

  it("respects disabled", () => {
    render(() => (
      <label>
        Qty
        <DecimalInput value="1" onValue={() => undefined} disabled />
      </label>
    ));
    expect(screen.getByLabelText("Qty")).toBeDisabled();
  });
});
