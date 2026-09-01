import { describe, expect, it } from "vitest";
import { HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";
import { visibleHeaderFeatures } from "../../shell/modules";

describe("production nav", () => {
  it("sidebar lists Assembly and Disassembly without nested recipe/job links", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production).toBeTruthy();
    const assembly = production!.children?.find((c) => c.id === "production_assembly");
    const disassembly = production!.children?.find((c) => c.id === "production_disassembly");
    expect(assembly?.href).toBe("/app/production/assembly/jobs");
    expect(assembly?.children).toBeUndefined();
    expect(disassembly?.href).toBe("/app/production/disassembly/jobs");
    expect(disassembly?.children).toBeUndefined();
    expect(production!.children?.map((c) => c.id)).toEqual([
      "production_assembly",
      "production_disassembly",
      "production_reports",
      "production_setup",
    ]);
  });

  it("does not render duplicate header feature tabs", () => {
    const mod = { id: "production", label: "Production", href: "/app/production/assembly/jobs", basePath: "/app/production", features: [] };
    expect(visibleHeaderFeatures(mod)).toEqual([]);
  });
});
