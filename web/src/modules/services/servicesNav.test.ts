import { describe, expect, it } from "vitest";
import { HOME_SIDEBAR_AREAS } from "../../shell/ecount-top-nav";
import { isTenantModuleEnabled } from "../../shared/moduleAccess";
import type { MeData } from "../../shared/auth-context";

function me(codes: string[], grantServices = false): MeData {
  return {
    user: {
      id: 1,
      email: "a@b.c",
      full_name: "Test",
      permissions: grantServices ? { "services.jobs": "read" } : {},
    },
    tenant: { id: 1, company_name: "Co", company_code: "CO", status: "active" },
    enabled_module_codes: codes,
    modules: codes.map((module_code) => ({ module_code, module_name: module_code, is_enabled: true })),
  } as MeData;
}

describe("services navigation", () => {
  it("adds Services beside After-Sales and hides it when the module is off", () => {
    const ids = HOME_SIDEBAR_AREAS.map((area) => area.id);
    expect(ids.indexOf("after_sales")).toBe(ids.indexOf("stocks") + 1);
    expect(ids.indexOf("services")).toBe(ids.indexOf("after_sales") + 1);
    const area = HOME_SIDEBAR_AREAS.find((item) => item.id === "services");
    expect(area?.label).toBe("Services");
    expect(area?.moduleId).toBe("services");
    expect(isTenantModuleEnabled(me(["sales", "after_sales"]), "services")).toBe(false);
    expect(isTenantModuleEnabled(me(["services"], true), "services")).toBe(true);
  });
});
