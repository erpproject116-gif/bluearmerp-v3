import { describe, expect, it } from "vitest";
import { filterMentionCatalog, MENTION_CATALOG } from "./mentionCatalog";

describe("mentionCatalog", () => {
  it("exposes types, commands, tools, and topics", () => {
    const kinds = new Set(MENTION_CATALOG.map((i) => i.kind));
    expect(kinds.has("type")).toBe(true);
    expect(kinds.has("command")).toBe(true);
    expect(kinds.has("tool")).toBe(true);
    expect(kinds.has("topic")).toBe(true);
  });

  it("returns a starter list on bare @ (empty query)", () => {
    const rows = filterMentionCatalog("");
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.some((r) => r.kind === "type")).toBe(true);
    expect(rows.some((r) => r.kind === "command")).toBe(true);
  });

  it("filters by label", () => {
    const rows = filterMentionCatalog("stock");
    expect(rows.some((r) => /stock/i.test(r.label) || /stock/i.test(r.insert))).toBe(true);
  });

  it("hides catalog when query is a type:prefix search", () => {
    expect(filterMentionCatalog("customer:acme")).toEqual([]);
  });
});
