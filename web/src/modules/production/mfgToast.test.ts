import { describe, expect, it } from "vitest";
import { friendlyMfgMessage } from "./mfgToast";

describe("friendlyMfgMessage", () => {
  it("maps work order not found", () => {
    expect(friendlyMfgMessage("Work order not found.", "x")).toContain("Jobs");
  });

  it("maps FG inspection", () => {
    expect(friendlyMfgMessage("Work order must pass FG inspection before completion.", "x")).toContain(
      "Quality check",
    );
  });

  it("maps shortage", () => {
    expect(friendlyMfgMessage("Insufficient stock / shortage", "x")).toContain("Not enough stock");
  });

  it("keeps unknown messages", () => {
    expect(friendlyMfgMessage("Custom server note", "fallback")).toBe("Custom server note");
  });

  it("uses fallback when empty", () => {
    expect(friendlyMfgMessage("", "fallback")).toBe("fallback");
  });
});
