import { describe, expect, it } from "vitest";
import { HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";
import { visibleHeaderFeatures } from "../../shell/modules";

describe("production nav", () => {
  it("sidebar Manufacturing links to dashboard hub", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production?.label).toBe("Manufacturing");
    expect(production?.href).toBe("/app/production");
  });

  it("sidebar matches PDF Phase 1 IA", () => {
    const production = HOME_SIDEBAR_AREAS.find((a) => a.id === "production");
    expect(production).toBeTruthy();
    expect(production!.children?.map((c) => c.id)).toEqual([
      "production_workflow",
      "production_all",
      "production_assembly",
      "production_disassembly",
      "production_recipe",
      "production_qc",
      "production_history",
      "production_reports",
      "production_setup",
    ]);
    expect(production!.children?.find((c) => c.id === "production_workflow")?.label).toBe("Dashboard");
    expect(production!.children?.find((c) => c.id === "production_disassembly")?.label).toBe(
      "Cutting / Breakdown",
    );
    expect(production!.children?.find((c) => c.id === "production_all")?.href).toBe(
      "/app/production/all/jobs",
    );
    expect(production!.children?.find((c) => c.id === "production_recipe")?.href).toBe(
      "/app/production/recipe/jobs",
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
