import { describe, expect, it } from "vitest";
import { toastDurationMs } from "./toast";
import { submitBusyLabel, SUBMIT_COPY } from "./submitCopy";

describe("toastDurationMs", () => {
  it("keeps success short", () => {
    expect(toastDurationMs({ type: "success" })).toBe(5000);
  });

  it("makes titled or action blockers sticky (0 = until dismiss)", () => {
    expect(toastDurationMs({ type: "warning", hasTitle: true })).toBe(0);
    expect(toastDurationMs({ type: "error", hasAction: true })).toBe(0);
    expect(toastDurationMs({ type: "warning", sticky: true })).toBe(0);
  });

  it("gives plain error/warning at least 20s", () => {
    expect(toastDurationMs({ type: "error" })).toBe(20000);
    expect(toastDurationMs({ type: "warning" })).toBe(20000);
  });
});

describe("submitBusyLabel", () => {
  it("returns idle when not busy", () => {
    expect(submitBusyLabel("save", false, "Save")).toBe("Save");
  });

  it("uses stock-aware posting copy", () => {
    expect(submitBusyLabel("post", true, "Process & Post")).toBe(SUBMIT_COPY.postingStock);
    expect(submitBusyLabel("draft", true, "Save draft")).toBe(SUBMIT_COPY.savingDraft);
  });
});
