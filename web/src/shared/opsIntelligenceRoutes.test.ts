import { describe, expect, it } from "vitest";
import { hrefPermissionCode } from "./permissionCodes";
import { appModules } from "../shell/modules";

describe("ops intelligence routes", () => {
  it("maps new dashboard paths to permissions", () => {
    expect(hrefPermissionCode["/app/dashboard/period-summary"]).toBe("dashboard.view");
    expect(appModules.find((m) => m.id === "dashboard")?.features.some((f) => f.href === "/app/dashboard?tab=intel")).toBe(
      true,
    );
    expect(appModules.find((m) => m.id === "dashboard")?.features.some((f) => f.href === "/app/dashboard/period-summary")).toBe(
      true,
    );
    expect(hrefPermissionCode["/app/crm/clients"]).toBe("crm.clients");
    expect(hrefPermissionCode["/app/operations/tasks"]).toBe("operations.dashboard");
    expect(hrefPermissionCode["/app/sop"]).toBe("sop.documents");
    expect(hrefPermissionCode["/app/cms"]).toBe("cms.pages");
    expect(hrefPermissionCode["/app/cms/media"]).toBe("cms.media");
    expect(hrefPermissionCode["/app/cms/redirects"]).toBe("cms.pages");
    expect(hrefPermissionCode["/app/articles"]).toBe("cms.pages");
    expect(hrefPermissionCode["/app/okr"]).toBe("okr.objectives");
  });

  it("registers sop, cms, and okr modules", () => {
    expect(appModules.some((m) => m.id === "sop")).toBe(true);
    expect(appModules.some((m) => m.id === "cms")).toBe(true);
    expect(appModules.find((m) => m.id === "cms")?.features.some((f) => f.href === "/app/cms")).toBe(true);
    expect(appModules.find((m) => m.id === "cms")?.features.some((f) => f.href === "/articles")).toBe(true);
    expect(appModules.find((m) => m.id === "cms")?.features.some((f) => f.href === "/app/cms/media")).toBe(true);
    expect(appModules.some((m) => m.id === "okr")).toBe(true);
    expect(appModules.find((m) => m.id === "crm")?.features.some((f) => f.href === "/app/crm/clients")).toBe(true);
    expect(appModules.find((m) => m.id === "operations")?.features.some((f) => f.href === "/app/operations/tasks")).toBe(
      true,
    );
  });
});
