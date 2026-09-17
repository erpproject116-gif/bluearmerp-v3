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

  it("maps staged output serial gap", () => {
    expect(
      friendlyMfgMessage("Record finished product first: staged output serial count 0 is less than required 1", "x"),
    ).toContain("less than required");
  });

  it("maps insufficient staged issue wrapper", () => {
    expect(friendlyMfgMessage("Take materials first: staged issue for Mouse: missing", "x")).toContain(
      "Take materials",
    );
  });

  it("keeps staged count mismatch details", () => {
    expect(
      friendlyMfgMessage(
        "Take materials first: staged issue for 00154: staged serial count 7 is less than required 10",
        "x",
      ),
    ).toContain("7 is less than required 10");
  });

  it("keeps add-conversion guidance", () => {
    expect(
      friendlyMfgMessage("add conversion unit→pc (or reverse) under Inventory → Units", "x"),
    ).toContain("Inventory → Units");
  });

  it("uses fallback for generic validation failed", () => {
    expect(friendlyMfgMessage("Validation failed.", "Pick a warehouse")).toBe("Pick a warehouse");
  });

  it("keeps unknown messages", () => {
    expect(friendlyMfgMessage("Custom server note", "fallback")).toBe("Custom server note");
  });

  it("uses fallback when empty", () => {
    expect(friendlyMfgMessage("", "fallback")).toBe("fallback");
  });
});
