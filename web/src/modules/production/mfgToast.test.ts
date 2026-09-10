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

  it("maps staged serial gap before stock shortage", () => {
    expect(
      friendlyMfgMessage("Take materials first: staged issue for 00151: staged serial count 0 does not match required 1", "x"),
    ).toContain("Take materials");
  });

  it("maps insufficient staged issue wrapper", () => {
    expect(friendlyMfgMessage("insufficient staged issue for Mouse: staged serial count 0", "x")).toContain(
      "Take materials",
    );
  });

  it("keeps unknown messages", () => {
    expect(friendlyMfgMessage("Custom server note", "fallback")).toBe("Custom server note");
  });

  it("uses fallback when empty", () => {
    expect(friendlyMfgMessage("", "fallback")).toBe("fallback");
  });
});
