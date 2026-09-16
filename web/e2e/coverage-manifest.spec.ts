import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.describe("Coverage manifest integrity", () => {
  test("@smoke @read-only manifest covers every smokeable route from app-routes.json", async () => {
    const routes = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/app-routes.json"), "utf8"),
    ) as { smokeable: string[]; generatedAt: string };
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/coverage-manifest.json"), "utf8"),
    ) as {
      sourceGeneratedAt: string;
      entries: { path: string; module: string; status: string }[];
      totals: { smokeable: number };
    };

    expect(manifest.sourceGeneratedAt).toBe(routes.generatedAt);
    expect(manifest.totals.smokeable).toBe(routes.smokeable.length);

    const set = new Set(manifest.entries.map((e) => e.path));
    const missing = routes.smokeable.filter((p) => !set.has(p));
    expect(missing, `Unmapped smokeable routes:\n${missing.join("\n")}`).toEqual([]);

    const extra = manifest.entries.map((e) => e.path).filter((p) => !routes.smokeable.includes(p));
    expect(extra, `Manifest paths not in smokeable:\n${extra.join("\n")}`).toEqual([]);

    expect(manifest.entries.every((e) => e.module && e.status)).toBeTruthy();
  });
});
