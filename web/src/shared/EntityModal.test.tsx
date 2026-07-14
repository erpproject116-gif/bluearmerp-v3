import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { EntityModal } from "./SpreadsheetGrid";
import { WideEntityModal } from "./WideEntityModal";

describe("EntityModal", () => {
  it("shows title and fires Cancel", async () => {
    const onClose = vi.fn();
    render(() => (
      <EntityModal open title="Edit Partner" onClose={onClose} onSave={() => undefined}>
        <p>Form body</p>
      </EntityModal>
    ));
    expect(screen.getByRole("heading", { name: "Edit Partner" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fires Save changes", async () => {
    const onSave = vi.fn();
    render(() => (
      <EntityModal open title="Edit Partner Save" onClose={() => undefined} onSave={onSave}>
        <p>Form body</p>
      </EntityModal>
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalled();
  });
});

describe("WideEntityModal", () => {
  it("shows title and fires Cancel", async () => {
    const onClose = vi.fn();
    render(() => (
      <WideEntityModal open title="New Quotation" onClose={onClose} onSave={() => undefined}>
        <p>Wide form</p>
      </WideEntityModal>
    ));
    expect(screen.getByRole("heading", { name: "New Quotation" })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("fires Save changes", async () => {
    const onSave = vi.fn();
    render(() => (
      <WideEntityModal open title="New Quotation Save" onClose={() => undefined} onSave={onSave}>
        <p>Wide form</p>
      </WideEntityModal>
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(onSave).toHaveBeenCalled();
  });

  it("switches tabs when provided", async () => {
    const onTabChange = vi.fn();
    render(() => (
      <WideEntityModal
        open
        title="Doc Tabs"
        onClose={() => undefined}
        tabs={[
          { id: "header", label: "Header" },
          { id: "lines", label: "Lines" },
        ]}
        activeTab="header"
        onTabChange={onTabChange}
      >
        <p>Tab body</p>
      </WideEntityModal>
    ));
    await fireEvent.click(screen.getByRole("button", { name: "Lines" }));
    expect(onTabChange).toHaveBeenCalledWith("lines");
  });
});
