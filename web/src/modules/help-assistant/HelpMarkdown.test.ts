import { describe, expect, it } from "vitest";
import { parseHelpMarkdown, helpMarkdownHasExternalLink } from "./HelpMarkdown";
import { safeAppPath } from "./safeAppPath";

describe("parseHelpMarkdown", () => {
  it("parses bold lists and paragraphs", () => {
    const blocks = parseHelpMarkdown("Hello **world**\n\n- one\n- two\n\n1. a\n2. b");
    expect(blocks.some((b) => b.type === "p")).toBe(true);
    expect(blocks.some((b) => b.type === "ul")).toBe(true);
    expect(blocks.some((b) => b.type === "ol")).toBe(true);
  });

  it("does not turn javascript: into a markdown link via regex", () => {
    const blocks = parseHelpMarkdown('Click [x](javascript:alert(1)) please');
    const p = blocks.find((b) => b.type === "p") as { type: "p"; text: string } | undefined;
    expect(p?.text).toContain("javascript:alert(1)");
    // inline renderer only matches /app/ or https? — so raw text stays without executable href from our linker
    expect(helpMarkdownHasExternalLink(p?.text || "")).toBe(false);
  });

  it("flags external https links", () => {
    expect(helpMarkdownHasExternalLink("See [docs](https://example.com/x)")).toBe(true);
  });
});

describe("safeAppPath", () => {
  it("allows /app paths", () => {
    expect(safeAppPath("/app/quotation/quotations/new")).toBe("/app/quotation/quotations/new");
  });

  it("rejects phishing and schemes", () => {
    expect(safeAppPath("https://evil.com")).toBeNull();
    expect(safeAppPath("//evil.com")).toBeNull();
    expect(safeAppPath("javascript:alert(1)")).toBeNull();
    expect(safeAppPath("/app/../etc")).toBeNull();
    expect(safeAppPath("/dashboard")).toBeNull();
  });
});
