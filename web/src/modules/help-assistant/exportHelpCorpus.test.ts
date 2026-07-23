import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { getHelpChunks } from "./helpIndex";

/**
 * Exports the Help chunk corpus for Go server-side retrieve.
 * Run: npm run export:help-corpus  (or vitest run this file)
 */
describe("export help corpus", () => {
  it("writes help_chunks.json for Go embed", () => {
    const chunks = getHelpChunks().map((c) => ({
      id: c.id,
      source: c.source,
      articleId: c.articleId,
      title: c.title,
      scenario: c.scenario ?? "",
      href: c.href,
      actionHref: c.actionHref,
      actionLabel: c.actionLabel,
      moduleTags: c.moduleTags,
      questions: c.questions ?? [],
      errorPhrases: c.errorPhrases ?? [],
      text: c.text,
      steps: c.steps ?? [],
    }));
    expect(chunks.length).toBeGreaterThan(50);

    const here = dirname(fileURLToPath(import.meta.url));
    const out = resolve(
      here,
      "../../../../api/internal/modules/helpassistant/corpus/help_chunks.json",
    );
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(chunks));
  });
});
