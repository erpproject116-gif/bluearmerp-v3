import { describe, expect, it } from "vitest";
import { composeHelpReply } from "./composeHelpReply";
import { searchHelp } from "./helpSearch";

describe("searchHelp", () => {
  it("finds RFQ workflow for rfq query on purchase-order path", () => {
    const hits = searchHelp("rfq workflow", "/app/purchase-order/rfq");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.chunk.articleId).toBe("rfq-workflow");
  });

  it("finds quotation guide on quotation path", () => {
    const hits = searchHelp("create quotation", "/app/quotation/quotations");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.chunk.articleId === "quotation")).toBe(true);
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

  it("finds serial-related content for return serial query", () => {
    const hits = searchHelp("return serial", "/app/sales/returns");
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.some((h) => h.chunk.moduleTags.includes("serial") || h.chunk.text.toLowerCase().includes("serial")),
    ).toBe(true);
  });

  it("returns empty for nonsense query", () => {
    const hits = searchHelp("zzzxxyy nonsense qwerty", "/app/dashboard");
    expect(hits.length).toBe(0);
  });
});

describe("composeHelpReply", () => {
  it("returns fallback message when no hits", () => {
    const reply = composeHelpReply("zzzxxyy nonsense", "/app/dashboard");
    expect(reply.fallback).toBe(true);
    expect(reply.hits.length).toBe(0);
    expect(reply.message).toMatch(/couldn't find/i);
  });

  it("returns hits for known query", () => {
    const reply = composeHelpReply("switch between businesses", "/app/dashboard");
    expect(reply.fallback).toBe(false);
    expect(reply.hits.length).toBeGreaterThan(0);
    expect(reply.hits[0]!.articleHref).toMatch(/\/app\/documentation\//);
  });
});
