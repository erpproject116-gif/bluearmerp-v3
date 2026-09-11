import { describe, expect, it } from "vitest";
import { HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";
import { visibleHeaderFeatures } from "../../shell/modules";

describe("production nav", () => {
  it("sidebar Manufacturing links to dashboard hub", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production?.label).toBe("Manufacturing");
    expect(production?.href).toBe("/app/production");
  });

  it("sidebar stays lean (no History / QC duplicates)", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production).toBeTruthy();
    expect(production!.children?.map((c) => c.id)).toEqual([
      "production_workflow",
      "production_all",
      "production_assembly",
      "production_disassembly",
      "production_recipe",
      "production_reports",
      "production_setup",
    ]);
    expect(production!.children?.find((c) => c.id === "production_disassembly")?.label).toBe("Cutting");
    expect(production!.children?.find((c) => c.id === "production_recipe")?.label).toBe("Recipe");
    expect(production!.children?.find((c) => c.id === "production_all")?.href).toBe(
      "/app/production/all/jobs",
    );
  });

  it("does not render duplicate header feature tabs", () => {
    const mod = {
      id: "production",
      label: "Production",
      href: "/app/production/assembly/jobs",
      basePath: "/app/production",
      features: [],
    };
    expect(visibleHeaderFeatures(mod)).toEqual([]);
  });
});
