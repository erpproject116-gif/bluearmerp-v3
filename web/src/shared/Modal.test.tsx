import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("renders title and children when open", () => {
    render(() => (
      <Modal open title="Test Modal" onClose={() => undefined}>
        <p>Modal body</p>
      </Modal>
    ));
    expect(screen.getByRole("dialog", { name: "Test Modal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Test Modal" })).toBeInTheDocument();
    expect(screen.getByText("Modal body")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(() => (
      <Modal open={false} title="Hidden Modal" onClose={() => undefined}>
        <p>Hidden body</p>
      </Modal>
    ));
    expect(screen.queryByRole("dialog", { name: "Hidden Modal" })).not.toBeInTheDocument();
  });

  it("calls onClose when Close button is clicked", async () => {
    const onClose = vi.fn();
    render(() => (
      <Modal open title="Closeable Modal" onClose={onClose}>
        <p>Body</p>
      </Modal>
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("uses stacked z-index class when stacked", () => {
    render(() => (
      <Modal open stacked title="Stacked Modal" onClose={() => undefined}>
        <p>Body</p>
      </Modal>
    ));
    const dialog = screen.getByRole("dialog", { name: "Stacked Modal" });
    expect(dialog.className).toContain("z-[70]");
  });
});

describe("Modal open toggle", () => {
  it("shows and hides with signal", async () => {
    function Harness() {
      const [open, setOpen] = createSignal(true);
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            Hide
          </button>
          <Modal open={open()} title="Toggle Modal" onClose={() => setOpen(false)}>
            <p>Visible</p>
          </Modal>
        </>
      );
    }
    render(() => <Harness />);
    expect(screen.getByRole("dialog", { name: "Toggle Modal" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByRole("dialog", { name: "Toggle Modal" })).not.toBeInTheDocument();
  });
});
