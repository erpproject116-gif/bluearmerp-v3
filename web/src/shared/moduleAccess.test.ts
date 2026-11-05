import { describe, expect, it } from "vitest";
import { isTenantFeatureEnabled, isTenantModuleEnabled } from "./moduleAccess";
import type { MeData } from "./auth-context";

function me(partial: Partial<MeData> & { enabled_module_codes?: string[]; modules?: MeData["modules"] }): MeData {
  return {
    user: {
      id: 1,
      email: "a@b.c",
      full_name: "Test",
      ...(partial.user ?? {}),
    },
    tenant: {
      id: 1,
      company_name: "Co",
      company_code: "CO",
      status: "active",
      ...(partial.tenant ?? {}),
    },
    enabled_module_codes: partial.enabled_module_codes ?? [],
    modules: partial.modules,
    role_preview: partial.role_preview,
  } as MeData;
}

describe("isTenantModuleEnabled", () => {
  it("kills data_center and always allows non-toggle shells", () => {
    expect(isTenantModuleEnabled(me({ enabled_module_codes: ["data_center"] }), "data_center")).toBe(false);
    expect(isTenantModuleEnabled(me({ enabled_module_codes: [] }), "documentation")).toBe(true);
    expect(isTenantModuleEnabled(me({ enabled_module_codes: ["sales"] }), "reports")).toBe(true);
  });

  it("requires code in enabled_module_codes when list present", () => {
    const m = me({ enabled_module_codes: ["sales", "inventory"] });
    expect(isTenantModuleEnabled(m, "sales")).toBe(true);
    expect(isTenantModuleEnabled(m, "quotation")).toBe(false);
  });

  it("shows production when manufacturing tenant module is on (nav gate)", () => {
    const m = me({ enabled_module_codes: ["inventory", "manufacturing"] });
    expect(isTenantModuleEnabled(m, "production")).toBe(true);
    expect(isTenantModuleEnabled(m, "manufacturing")).toBe(true);
  });

  it("hides production when manufacturing tenant module is off", () => {
    const m = me({ enabled_module_codes: ["inventory"] });
    expect(isTenantModuleEnabled(m, "production")).toBe(false);
  });

  it("treats empty enabled_module_codes as all-off when modules registry is present", () => {
    const m = me({
      enabled_module_codes: [],
      modules: [{ module_code: "sales", module_name: "Sales", is_enabled: false }],
    });
    expect(isTenantModuleEnabled(m, "sales")).toBe(false);
    expect(isTenantModuleEnabled(m, "inventory")).toBe(false);
  });

  it("falls back to permissions when modules registry is absent and codes empty", () => {
    const m = me({ enabled_module_codes: [], modules: undefined });
    expect(isTenantModuleEnabled(m, "documentation")).toBe(true);
  });

  it("lets elevated tenant admins use HR when hr is not in enabled_module_codes", () => {
    const owner = me({
      enabled_module_codes: [],
      modules: [{ module_code: "hr", module_name: "HR", is_enabled: false }],
      user: { id: 1, email: "owner@co.com", full_name: "Owner", is_tenant_owner: true },
    });
    expect(isTenantModuleEnabled(owner, "hr")).toBe(true);
    expect(isTenantModuleEnabled(owner, "sales")).toBe(false);

    const productOwner = me({
      enabled_module_codes: ["sales"],
      modules: [
        { module_code: "hr", module_name: "HR", is_enabled: false },
        { module_code: "sales", module_name: "Sales", is_enabled: true },
      ],
      user: { id: 2, email: "itsjohnranel@gmail.com", full_name: "PO" },
    });
    expect(isTenantModuleEnabled(productOwner, "hr")).toBe(true);

    const staff = me({
      enabled_module_codes: [],
      modules: [{ module_code: "hr", module_name: "HR", is_enabled: false }],
      user: { id: 3, email: "staff@co.com", full_name: "Staff" },
    });
    expect(isTenantModuleEnabled(staff, "hr")).toBe(false);
  });

  it("defeats elevated HR bypass during role preview", () => {
    const m = me({
      enabled_module_codes: [],
      modules: [{ module_code: "hr", module_name: "HR", is_enabled: false }],
      user: { id: 1, email: "itsjohnranel@gmail.com", full_name: "PO", is_platform_superadmin: true },
      role_preview: { active: true, role_code: "hr_clerk" },
    });
    expect(isTenantModuleEnabled(m, "hr")).toBe(false);
  });
});

describe("isTenantFeatureEnabled", () => {
  it("denies when parent module is off", () => {
    const m = me({
      enabled_module_codes: ["sales"],
      modules: [{ module_code: "inventory.wms", module_name: "WMS", is_enabled: true }],
    });
    expect(isTenantFeatureEnabled(m, "inventory.wms", "inventory")).toBe(false);
  });

  it("inherits parent when feature row missing", () => {
    const m = me({
      enabled_module_codes: ["inventory"],
      modules: [{ module_code: "inventory", module_name: "Stock", is_enabled: true }],
    });
    expect(isTenantFeatureEnabled(m, "inventory.wms", "inventory")).toBe(true);
  });

  it("returns true when modules list absent (compat)", () => {
    const m = me({ enabled_module_codes: ["inventory"], modules: undefined });
    expect(isTenantFeatureEnabled(m, "inventory.wms", "inventory")).toBe(true);
  });

  it("honors explicit feature row", () => {
    const on = me({
      enabled_module_codes: ["inventory", "inventory.wms"],
      modules: [
        { module_code: "inventory", module_name: "Stock", is_enabled: true },
        { module_code: "inventory.wms", module_name: "WMS", is_enabled: true },
      ],
    });
    expect(isTenantFeatureEnabled(on, "inventory.wms", "inventory")).toBe(true);

    const off = me({
      enabled_module_codes: ["inventory"],
      modules: [
        { module_code: "inventory", module_name: "Stock", is_enabled: true },
        { module_code: "inventory.wms", module_name: "WMS", is_enabled: false },
      ],
    });
    expect(isTenantFeatureEnabled(off, "inventory.wms", "inventory")).toBe(false);
  });
});
