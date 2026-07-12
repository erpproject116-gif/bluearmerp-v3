import { describe, expect, it } from "vitest";
import { composeHelpReply } from "./composeHelpReply";
import { HELP_GOLDEN_QUERIES } from "./helpGoldenQueries";
import { getHelpChunks } from "./helpIndex";
import { searchHelp } from "./helpSearch";

function expectArticle(query: string, path: string, articleId: string) {
  const hits = searchHelp(query, path);
  expect(hits.length, `no hits for "${query}"`).toBeGreaterThan(0);
  expect(
    hits.some((h) => h.chunk.articleId === articleId),
    `expected ${articleId} in [${hits.map((h) => h.chunk.articleId).join(", ")}] for "${query}"`,
  ).toBe(true);
}

describe("searchHelp index", () => {
  it("indexes scenario expansion articles and aliases", () => {
    const chunks = getHelpChunks();
    const ids = new Set(chunks.map((c) => c.articleId));
    expect(ids.has("cannot-confirm-document")).toBe(true);
    expect(ids.has("operations-calendar-day-today")).toBe(true);
    expect(ids.has("chart-of-accounts-ph-template")).toBe(true);
    const confirm = chunks.find((c) => c.articleId === "cannot-confirm-document" && c.id.endsWith("#overview"));
    expect(confirm?.questions?.length).toBeGreaterThan(0);
    expect(confirm?.errorPhrases?.length).toBeGreaterThan(0);
  });

  it("finds quotation-related content on quotation path", () => {
    const hits = searchHelp("create quotation", "/app/quotation/quotations");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some(
        (h) =>
          h.chunk.articleId === "quotation" ||
          h.chunk.articleId === "quotation-to-sales-flow" ||
          h.chunk.title.toLowerCase().includes("quotation"),
      ),
    ).toBe(true);
  });

  it("finds serial content for serial query", () => {
    const hits = searchHelp("serial number scan", "/app/inventory/serial-lot/receive");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some((h) => h.chunk.moduleTags.includes("serial") || h.chunk.title.toLowerCase().includes("serial")),
    ).toBe(true);
  });

  it("finds goods receipt content on GR path", () => {
    const hits = searchHelp("goods receipt", "/app/goods-receipt/list");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some(
        (h) =>
          h.chunk.title.toLowerCase().includes("goods") ||
          h.chunk.moduleTags.includes("goods-receipt") ||
          h.chunk.text.toLowerCase().includes("goods receipt"),
      ),
    ).toBe(true);
  });

  it("prefers kb scenario articles over guides when scores compete", () => {
    const hits = searchHelp("operations calendar today hourly", "/app/operations/calendar", 5);
    expect(hits[0]?.chunk.source).toBe("kb");
    expect(hits[0]?.chunk.articleId).toBe("operations-calendar-day-today");
  });

  it("returns empty for nonsense query", () => {
    expect(searchHelp("zzzxxyy nonsense qwerty", "/app/dashboard").length).toBe(0);
  });
});

describe("searchHelp golden queries", () => {
  it(`covers ${HELP_GOLDEN_QUERIES.length} fixtures`, () => {
    expect(HELP_GOLDEN_QUERIES.length).toBeGreaterThanOrEqual(80);
  });

  for (const row of HELP_GOLDEN_QUERIES) {
    it(`${row.expectArticleId} ← "${row.query}"`, () => {
      expectArticle(row.query, row.path, row.expectArticleId);
    });
  }
});

describe("composeHelpReply", () => {
  it("returns fallback message when no hits", () => {
    const reply = composeHelpReply("zzzxxyy nonsense", "/app/dashboard");
    expect(reply.fallback).toBe(true);
    expect(reply.hits.length).toBe(0);
    expect(reply.message).toMatch(/couldn't find/i);
  });

  it("returns hits for known query with articleId", () => {
    const reply = composeHelpReply("switch between businesses", "/app/dashboard");
    expect(reply.fallback).toBe(false);
    expect(reply.hits.length).toBeGreaterThan(0);
    expect(reply.hits[0]!.articleId).toBeTruthy();
    expect(reply.hits[0]!.articleHref).toMatch(/\/app\/documentation\//);
  });

  it("returns hits for cannot confirm", () => {
    const reply = composeHelpReply("cannot confirm document", "/app/quotation/quotations");
    expect(reply.fallback).toBe(false);
    expect(reply.hits.some((h) => h.articleId === "cannot-confirm-document")).toBe(true);
  });

  it("matches progress status error phrase", () => {
    const reply = composeHelpReply("Please fill in required fields: Progress status", "/app/quotation/quotations");
    expect(reply.fallback).toBe(false);
    expect(reply.hits.some((h) => h.articleId === "quotation-progress-status")).toBe(true);
  });
});
