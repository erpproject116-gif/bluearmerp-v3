import { describe, expect, it } from "vitest";
import { normalizeHomeWidgets } from "./homeWidgets";

describe("normalizeHomeWidgets", () => {
  it("always keeps finance first", () => {
    expect(normalizeHomeWidgets(["day_jobs", "sales_trend"])[0]).toBe("finance");
  });

  it("drops unknown and duplicate ids", () => {
    expect(normalizeHomeWidgets(["finance", "nope", "day_jobs", "day_jobs"])).toEqual([
      "finance",
      "day_jobs",
    ]);
  });

  it("keeps recent activity on the allowlist", () => {
    expect(normalizeHomeWidgets(["recent_activity"])).toEqual(["finance", "recent_activity"]);
  });
});
