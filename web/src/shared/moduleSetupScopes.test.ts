import { describe, expect, it } from "vitest";
import { MODULE_SETUP_SCOPES, setupScopeFromPath } from "./moduleSetupScopes";

describe("setupScopeFromPath", () => {
  it("maps production setup hub", () => {
    expect(setupScopeFromPath("/app/production/setup")).toBe("production");
    expect(setupScopeFromPath("/app/production")).toBe("production");
  });

  it("exposes FG QC and completed-WO release keys", () => {
    const scope = MODULE_SETUP_SCOPES.production;
    expect(scope.policyKeys).toContain("manufacturing_require_fg_qc");
    expect(scope.policyKeys).toContain("sales_count_completed_wo_toward_release");
  });
});
