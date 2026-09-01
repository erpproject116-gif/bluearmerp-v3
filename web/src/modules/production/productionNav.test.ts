import { describe, expect, it } from "vitest";
import { HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";

describe("production nav", () => {
  it("includes Assembly and Disassembly recipe/job links", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production).toBeTruthy();
    const assembly = production!.children?.find((c) => c.id === "production_assembly");
    const disassembly = production!.children?.find((c) => c.id === "production_disassembly");
    expect(assembly?.children?.map((c) => c.href)).toEqual([
      "/app/production/assembly/recipes",
      "/app/production/assembly/jobs",
    ]);
    expect(disassembly?.children?.map((c) => c.href)).toEqual([
      "/app/production/disassembly/recipes",
      "/app/production/disassembly/jobs",
    ]);
  });
});
