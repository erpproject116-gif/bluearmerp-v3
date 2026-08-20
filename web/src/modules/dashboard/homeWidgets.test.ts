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

  it("strips legacy tab widget ids", () => {
    expect(normalizeHomeWidgets(["getting_started", "day_jobs"])).toEqual(["finance", "day_jobs"]);
  });
});
