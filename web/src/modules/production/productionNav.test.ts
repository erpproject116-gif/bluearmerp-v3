import { describe, expect, it } from "vitest";
import { ECOUNT_TOP_MODULES, HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";
import {
  HEADER_PRIMARY_TAB_CAP,
  appModules,
  splitHeaderFeatures,
  visibleHeaderFeatures,
} from "../../shell/modules";

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
      "production_reports",
      "production_costs",
      "production_waste",
      "production_setup",
    ]);
    expect(production!.children?.find((c) => c.id === "production_disassembly")?.label).toBe("Cutting");
    expect(production!.children?.find((c) => c.id === "production_assembly")?.href).toBe(
      "/app/production/assembly/recipes",
    );
    expect(production!.children?.find((c) => c.id === "production_disassembly")?.href).toBe(
      "/app/production/disassembly/recipes",
    );
    expect(production!.children?.find((c) => c.id === "production_all")?.href).toBe(
      "/app/production/all/jobs",
    );
    expect(production!.children?.find((c) => c.id === "production_waste")?.href).toBe(
      "/app/production/reports?tab=waste-variance",
    );
    expect(production!.children?.find((c) => c.id === "production_waste")?.label).toBe("Waste & variance");
  });

  it("does not render duplicate header feature tabs for empty features", () => {
    const mod = {
      id: "production",
      label: "Production",
      href: "/app/production/assembly/jobs",
      basePath: "/app/production",
      features: [],
    };
    expect(visibleHeaderFeatures(mod)).toEqual([]);
  });

  it("header Production tabs include Recipe and use Cutting labels", () => {
    const production = appModules.find((m) => m.id === "production");
    expect(production).toBeTruthy();
    const labels = production!.features.map((f) => f.label);
    expect(labels).toContain("Recipe · Recipes");
    expect(labels).toContain("Recipe · Jobs");
    expect(labels).toContain("Cutting · Recipes");
    expect(labels).toContain("Cutting · Jobs");
    expect(labels).not.toContain("Disassembly · Recipes");
    const recipeJobs = production!.features.find((f) => f.label === "Recipe · Jobs");
    expect(recipeJobs?.href).toBe("/app/production/recipe/jobs");
  });

  it("Operations strip hint differs from Project Management sidebar hint", () => {
    const opsStrip = ECOUNT_TOP_MODULES.find((m) => m.id === "inv1");
    expect(opsStrip?.label).toBe("Operations");
    expect(opsStrip?.hint).toMatch(/project management/i);

    const more = HOME_SIDEBAR_AREAS.find((a) => a.id === "more");
    const pm = more?.children?.find((c) => c.id === "operations");
    expect(pm?.label).toBe("Project Management");
    expect(pm?.hint).toMatch(/Operations strip/i);
  });

  it("caps primary header tabs and keeps Setup visible", () => {
    const sales = appModules.find((m) => m.id === "sales");
    expect(sales).toBeTruthy();
    const split = splitHeaderFeatures(sales!);
    expect(split.primary.length).toBeLessThanOrEqual(HEADER_PRIMARY_TAB_CAP);
    expect(split.primary.length + split.overflow.length).toBeGreaterThan(HEADER_PRIMARY_TAB_CAP);
    expect(split.overflow.some((f) => f.label === "Sales categories")).toBe(true);
  });
});
