import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@solidjs/testing-library";
import { InlineGuidesProvider, InlineTip, resetInlineGuidesForTests, useInlineGuides } from "./inlineGuides";
import { ModalFormGuide } from "./ModalFormGuide";

function TipsToggle() {
  const guides = useInlineGuides();
  return (
    <button type="button" onClick={() => guides.toggle()}>
      Tips {guides.enabled() ? "on" : "off"}
    </button>
  );
}

describe("inlineGuides Tips toggle", () => {
  beforeEach(() => {
    resetInlineGuidesForTests();
  });

  it("hides InlineTip and ModalFormGuide when Tips off", () => {
    render(() => (
      <InlineGuidesProvider>
        <TipsToggle />
        <InlineTip>
          <p>How Stocks fits together</p>
        </InlineTip>
        <ModalFormGuide guideId="sales" />
      </InlineGuidesProvider>
    ));

    expect(screen.getByText("How Stocks fits together")).toBeInTheDocument();
    expect(screen.getByText("Creating a sale")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tips on" }));
    expect(screen.getByRole("button", { name: "Tips off" })).toBeInTheDocument();
    expect(screen.queryByText("How Stocks fits together")).not.toBeInTheDocument();
    expect(screen.queryByText("Creating a sale")).not.toBeInTheDocument();
  });

  it("keeps toggle and tip consumers in sync via shared fallback without provider", () => {
    render(() => (
      <>
        <TipsToggle />
        <InlineTip>
          <p>Ungated tip copy</p>
        </InlineTip>
      </>
    ));
    expect(screen.getByText("Ungated tip copy")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tips on" }));
    expect(screen.queryByText("Ungated tip copy")).not.toBeInTheDocument();
  });
});
