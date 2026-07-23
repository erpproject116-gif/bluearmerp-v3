import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { HELP_GOLDEN_QUERIES } from "./helpGoldenQueries";

describe("export golden queries for Go CI", () => {
  it("writes golden_queries.json", () => {
    expect(HELP_GOLDEN_QUERIES.length).toBeGreaterThan(20);
    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(
      here,
      "../../../../api/internal/modules/helpassistant/corpus/golden_queries.json",
    );
    writeFileSync(out, JSON.stringify(HELP_GOLDEN_QUERIES, null, 2));
  });
});
