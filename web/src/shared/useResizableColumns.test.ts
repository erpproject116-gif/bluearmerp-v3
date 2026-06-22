import { describe, expect, it } from "vitest";
import { DEFAULT_COL_WIDTH, MAX_COL_WIDTH, MIN_COL_WIDTH } from "./useResizableColumns";

describe("useResizableColumns constants", () => {
  it("defines sensible default bounds", () => {
    expect(MIN_COL_WIDTH).toBeLessThan(DEFAULT_COL_WIDTH);
    expect(DEFAULT_COL_WIDTH).toBeLessThan(MAX_COL_WIDTH);
  });
});
