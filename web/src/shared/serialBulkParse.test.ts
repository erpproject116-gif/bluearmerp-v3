import { describe, expect, it } from "vitest";
import { dedupeSerials, formatSerialBulkList, parseAndDedupeSerialBulkInput, parseSerialBulkInput } from "./serialBulkParse";

describe("serialBulkParse", () => {
  it("splits comma-separated serials", () => {
    expect(parseSerialBulkInput("A001, B002,C003")).toEqual(["A001", "B002", "C003"]);
  });

  it("splits newlines and semicolons", () => {
    expect(parseSerialBulkInput("A001\nB002;C003")).toEqual(["A001", "B002", "C003"]);
  });

  it("dedupes case-insensitively", () => {
    expect(dedupeSerials(["abc", "ABC", "AbC", "def"])).toEqual(["abc", "def"]);
  });

  it("formats as comma-separated list", () => {
    expect(formatSerialBulkList(["A", "B"])).toBe("A, B");
  });

  it("parseAndDedupe combines both", () => {
    expect(parseAndDedupeSerialBulkInput("x, X, y")).toEqual(["x", "y"]);
  });
});
