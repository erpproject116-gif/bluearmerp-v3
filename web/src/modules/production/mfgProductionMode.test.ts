import { describe, expect, it } from "vitest";
import { MFG_COPY, modeFromPath, parseMfgMode, recipesHref, jobsHref } from "./mfgProductionMode";

describe("mfgProductionMode", () => {
  it("parses route mode", () => {
    expect(parseMfgMode("assembly")).toBe("assembly");
    expect(parseMfgMode("disassembly")).toBe("disassembly");
    expect(parseMfgMode("recipe")).toBe("recipe");
    expect(parseMfgMode("all")).toBe("all");
    expect(parseMfgMode("invalid")).toBeNull();
  });

  it("reads mode from pathname", () => {
    expect(modeFromPath("/app/production/assembly/recipes")).toBe("assembly");
    expect(modeFromPath("/app/production/disassembly/jobs")).toBe("disassembly");
    expect(modeFromPath("/app/production/recipe/jobs")).toBe("recipe");
    expect(modeFromPath("/app/production/all/jobs")).toBe("all");
    expect(modeFromPath("/app/production/reports")).toBeNull();
  });

  it("uses Assembly / Cutting / Recipe branch titles", () => {
    expect(MFG_COPY.assembly.branchTitle).toBe("Assembly");
    expect(MFG_COPY.disassembly.branchTitle).toBe("Cutting");
    expect(MFG_COPY.recipe.branchTitle).toBe("Recipe");
    expect(MFG_COPY.all.branchTitle).toBe("All production");
  });

  it("builds branch hrefs", () => {
    expect(recipesHref("assembly")).toBe("/app/production/assembly/recipes");
    expect(recipesHref("recipe")).toBe("/app/production/recipe/recipes");
    expect(recipesHref("all")).toBe("/app/production/assembly/recipes");
    expect(jobsHref("disassembly")).toBe("/app/production/disassembly/jobs");
    expect(jobsHref("recipe")).toBe("/app/production/recipe/jobs");
    expect(jobsHref("all")).toBe("/app/production/all/jobs");
  });
});
