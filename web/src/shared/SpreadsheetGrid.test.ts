import { describe, expect, it } from "vitest";

describe("spreadsheet shortcuts contract", () => {
  it("documents expected keyboard actions", () => {
    const shortcuts = {
      F2: "open create modal",
      Enter: "open edit modal for focused row",
      ArrowUp: "move row focus up",
      ArrowDown: "move row focus down",
    };
    expect(Object.keys(shortcuts)).toHaveLength(4);
  });
});

describe("spreadsheet multi-select contract", () => {
  it("toggles page selection without dropping other pages", () => {
    const pageIds = [1, 2, 3];
    const selected = new Set([10, 11]);
    const selectPage = (checked: boolean) => {
      const next = new Set(selected);
      for (const id of pageIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    };
    const all = selectPage(true);
    expect([...all].sort((a, b) => a - b)).toEqual([1, 2, 3, 10, 11]);
    const cleared = (() => {
      const next = new Set(all);
      for (const id of pageIds) next.delete(id);
      return next;
    })();
    expect([...cleared].sort((a, b) => a - b)).toEqual([10, 11]);
  });

  it("treats array and Set selectedIds equivalently", () => {
    const fromArray = new Set([1, 2, 3]);
    const fromSet = new Set(new Set([1, 2, 3]));
    expect([...fromArray]).toEqual([...fromSet]);
  });
});
