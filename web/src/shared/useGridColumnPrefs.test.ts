import { describe, expect, it, beforeEach } from "vitest";
import { createRoot } from "solid-js";
import { useGridColumnPrefs } from "./useGridColumnPrefs";

describe("useGridColumnPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("hides hideable columns and persists", () => {
    createRoot((dispose) => {
      const prefs = useGridColumnPrefs(
        () => "test.list",
        () => [
          { key: "a", header: "A", hideable: false },
          { key: "b", header: "B" },
          { key: "c", header: "C" },
        ],
      );
      expect(prefs.visibleColumns().map((c) => c.key)).toEqual(["a", "b", "c"]);
      prefs.setColumnVisible("b", false);
      expect(prefs.visibleColumns().map((c) => c.key)).toEqual(["a", "c"]);
      expect(JSON.parse(localStorage.getItem("bluearm:grid.columns:test.list")!)).toEqual(["b"]);
      prefs.setColumnVisible("a", false); // non-hideable ignored
      expect(prefs.visibleColumns().map((c) => c.key)).toEqual(["a", "c"]);
      prefs.showAll();
      expect(prefs.visibleColumns().map((c) => c.key)).toEqual(["a", "b", "c"]);
      dispose();
    });
  });

  it("is disabled without prefs key", () => {
    createRoot((dispose) => {
      const prefs = useGridColumnPrefs(
        () => undefined,
        () => [{ key: "a", header: "A" }],
      );
      expect(prefs.enabled()).toBe(false);
      dispose();
    });
  });
});
