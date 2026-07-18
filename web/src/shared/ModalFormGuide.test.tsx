import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { ModalFormGuide } from "./ModalFormGuide";

describe("ModalFormGuide", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts expanded on first visit and collapses with persistence", () => {
    render(() => <ModalFormGuide guideId="sales" />);
    expect(screen.getByText("Creating a sales invoice")).toBeInTheDocument();
    expect(screen.getByText(/bill you issue/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(screen.queryByText(/bill you issue/i)).not.toBeInTheDocument();
    expect(localStorage.getItem("modal-form-guide-expanded:sales")).toBe("0");

    fireEvent.click(screen.getByRole("button", { name: "Show tip" }));
    expect(screen.getByText(/bill you issue/i)).toBeInTheDocument();
    expect(localStorage.getItem("modal-form-guide-expanded:sales")).toBe("1");
  });

  it("respects stored collapsed state", () => {
    localStorage.setItem("modal-form-guide-expanded:quotation", "0");
    render(() => <ModalFormGuide guideId="quotation" />);
    expect(screen.queryByText(/price offer/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show tip" })).toBeInTheDocument();
  });

  it("does not crash when localStorage throws", () => {
    const proto = Storage.prototype;
    const getItem = proto.getItem;
    const setItem = proto.setItem;
    proto.getItem = () => {
      throw new Error("private");
    };
    proto.setItem = () => {
      throw new Error("private");
    };
    try {
      render(() => <ModalFormGuide guideId="partner" title="Custom" summary="Safe" />);
      expect(screen.getByText("Custom")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Hide" }));
      expect(screen.queryByText("Safe")).not.toBeInTheDocument();
    } finally {
      proto.getItem = getItem;
      proto.setItem = setItem;
    }
  });
});
