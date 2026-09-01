import { describe, expect, it } from "vitest";
import { MFG_COPY, modeFromPath, parseMfgMode, recipesHref, jobsHref } from "./mfgProductionMode";

describe("mfgProductionMode", () => {
  it("parses route mode", () => {
    expect(parseMfgMode("assembly")).toBe("assembly");
    expect(parseMfgMode("disassembly")).toBe("disassembly");
    expect(parseMfgMode("invalid")).toBeNull();
  });

  it("reads mode from pathname", () => {
    expect(modeFromPath("/app/production/assembly/recipes")).toBe("assembly");
    expect(modeFromPath("/app/production/disassembly/jobs")).toBe("disassembly");
    expect(modeFromPath("/app/production/reports")).toBeNull();
  });

  it("uses Assembly / Disassembly branch titles", () => {
    expect(MFG_COPY.assembly.branchTitle).toBe("Assembly");
    expect(MFG_COPY.disassembly.branchTitle).toBe("Disassembly");
  });

  it("builds branch hrefs", () => {
    expect(recipesHref("assembly")).toBe("/app/production/assembly/recipes");
    expect(jobsHref("disassembly")).toBe("/app/production/disassembly/jobs");
  });
});
