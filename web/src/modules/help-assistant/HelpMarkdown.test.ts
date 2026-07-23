import { describe, expect, it } from "vitest";
import { parseHelpMarkdown } from "./HelpMarkdown";

describe("parseHelpMarkdown", () => {
  it("parses bold lists and paragraphs", () => {
    const blocks = parseHelpMarkdown("Hello **world**\n\n- one\n- two\n\n1. a\n2. b");
    expect(blocks.some((b) => b.type === "p")).toBe(true);
    expect(blocks.some((b) => b.type === "ul")).toBe(true);
    expect(blocks.some((b) => b.type === "ol")).toBe(true);
  });
});
