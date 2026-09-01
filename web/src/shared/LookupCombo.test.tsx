import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { LookupCombo, type LookupOption } from "./LookupCombo";

const OPTIONS: LookupOption[] = [
  { id: 1, label: "Acme Corp", sublabel: "Customer" },
  { id: 2, label: "Beta LLC" },
];

describe("LookupCombo", () => {
  it("loads options and selects one", async () => {
    const fetchOptions = vi.fn(async (q: string) =>
      OPTIONS.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())),
    );
    const onSelect = vi.fn();

    function Harness() {
      const [text, setText] = createSignal("");
      const [id, setId] = createSignal<number | null>(null);
      return (
        <LookupCombo
          label="Customer Select"
          value={() => text()}
          selectedId={() => id()}
          onInput={setText}
          onSelect={(opt) => {
            setId(opt.id);
            setText(opt.label);
            onSelect(opt);
          }}
          onClear={() => {
            setId(null);
            setText("");
          }}
          fetchOptions={fetchOptions}
        />
      );
    }

    render(() => <Harness />);
    const input = screen.getByRole("combobox", { name: "Customer Select" });
    await waitFor(() => expect(fetchOptions).toHaveBeenCalled());

    await fireEvent.focus(input);
    await fireEvent.input(input, { target: { value: "Acme" } });
    await waitFor(() => expect(screen.getByText("Acme Corp")).toBeInTheDocument(), { timeout: 2000 });

    await fireEvent.click(screen.getByText("Acme Corp"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 1, label: "Acme Corp" }));
  });

  it("clears selection", async () => {
    const onClear = vi.fn();
    function Harness() {
      const [text, setText] = createSignal("Acme Corp");
      const [id, setId] = createSignal<number | null>(1);
      return (
        <LookupCombo
          label="Customer Clear"
          value={() => text()}
          selectedId={() => id()}
          onInput={setText}
          onSelect={(opt) => {
            setId(opt.id);
            setText(opt.label);
          }}
          onClear={() => {
            setId(null);
            setText("");
            onClear();
          }}
          fetchOptions={async () => OPTIONS}
        />
      );
    }
    render(() => <Harness />);
    const clearBtn = screen.getByRole("button", { name: "Clear" });
    await fireEvent.mouseDown(clearBtn);
    expect(onClear).toHaveBeenCalled();
    expect(screen.getByRole("combobox", { name: "Customer Clear" })).toHaveValue("");
  });
});
