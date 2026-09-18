import { describe, expect, it, vi } from "vitest";
import { keepProgressRowVisible } from "./keepProgressRowVisible";

describe("keepProgressRowVisible", () => {
  it("does nothing when filter is All", () => {
    const set = vi.fn();
    keepProgressRowVisible("", set, "completed");
    expect(set).not.toHaveBeenCalled();
  });

  it("does nothing when filter already matches new progress", () => {
    const set = vi.fn();
    keepProgressRowVisible("completed", set, "completed");
    expect(set).not.toHaveBeenCalled();
  });

  it("switches to All when Unconfirmed filter would hide Completed", () => {
    const set = vi.fn();
    keepProgressRowVisible("unconfirmed", set, "completed");
    expect(set).toHaveBeenCalledWith("");
  });

  it("treats confirm filter as matching completed", () => {
    const set = vi.fn();
    keepProgressRowVisible("confirm", set, "completed");
    expect(set).not.toHaveBeenCalled();
  });
});
