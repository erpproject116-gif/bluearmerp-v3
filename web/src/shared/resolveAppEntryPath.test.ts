import { describe, expect, it, vi } from "vitest";
import type { MeData } from "./auth-context";
import {
  canManageWorkspaceSetup,
  resolveAppEntryPath,
  resolveRoleHomePath,
  shouldLandOnProductionHome,
} from "./resolveAppEntryPath";

vi.mock("./api", () => ({
  apiFetch: vi.fn(),
  readPersistedAccessToken: () => null,
}));

import { apiFetch } from "./api";

function baseMe(overrides: Partial<MeData["user"]> = {}): MeData {
  return {
    user: {
      id: 1,
      email: "user@example.com",
      full_name: "User",
      permissions: {},
      ...overrides,
    },
    tenant: {
      id: 1,
      company_name: "Acme",
      company_code: "ACME",
      status: "active",
    },
    enabled_module_codes: ["manufacturing", "sales"],
    modules: [
      { module_code: "manufacturing", module_name: "Manufacturing", is_enabled: true },
      { module_code: "sales", module_name: "Sales", is_enabled: true },
    ],
  };
}

describe("resolveAppEntryPath role home", () => {
  it("never sends non-admins to setup", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { required_complete: false, setup_wizard_skipped: false },
    } as never);
    const me = baseMe({ permissions: { sales: "read" } });
    expect(canManageWorkspaceSetup(me)).toBe(false);
    await expect(resolveAppEntryPath(me)).resolves.toBe("/app/dashboard");
  });

  it("sends manufacturing-primary staff to production hub", () => {
    const me = baseMe({
      tenant_role: "production_operator",
      permissions: { "manufacturing.work_orders": "write" },
    });
    me.enabled_module_codes = ["manufacturing"];
    me.modules = me.modules!.filter((m) => m.module_code === "manufacturing");
    expect(shouldLandOnProductionHome(me)).toBe(true);
    expect(resolveRoleHomePath(me)).toBe("/app/production");
  });

  it("keeps owners on dashboard when setup is complete", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { required_complete: true, setup_wizard_skipped: false },
    } as never);
    const me = baseMe({
      is_tenant_owner: true,
      permissions: { "manufacturing.work_orders": "write", sales: "write" },
    });
    await expect(resolveAppEntryPath(me)).resolves.toBe("/app/dashboard");
  });

  it("keeps a remoted operator on the customer home when setup is incomplete", async () => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValue({
      data: { required_complete: false, setup_wizard_skipped: false },
    } as never);
    const me = baseMe({ is_platform_superadmin: true, is_tenant_owner: true });
    me.support_session = {
      id: 4,
      tenant_id: 99,
      customer_id: 931,
      ends_at: "2026-10-12T13:00:00Z",
      access_mode: "read_only",
    };
    await expect(resolveAppEntryPath(me)).resolves.toBe("/app/dashboard");
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it("sends new workspace admins to Home onboarding when foundation is incomplete", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      data: { required_complete: false, setup_wizard_skipped: false },
    } as never);
    const me = baseMe({ is_store_admin: true });
    await expect(resolveAppEntryPath(me)).resolves.toBe("/app/dashboard/onboarding");
  });
});
