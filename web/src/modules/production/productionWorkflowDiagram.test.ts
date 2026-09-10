import { describe, expect, it } from "vitest";
import {
  activeFlowStepIndex,
  isProductionHubPath,
  PRODUCTION_FLOWS,
  visibleFlowSteps,
} from "./productionWorkflowDiagram";

describe("productionWorkflowDiagram", () => {
  it("detects production hub path", () => {
    expect(isProductionHubPath("/app/production")).toBe(true);
    expect(isProductionHubPath("/app/production/")).toBe(true);
    expect(isProductionHubPath("/app/production/assembly/jobs")).toBe(false);
  });

  it("assembly default strip is Recipe → Job → Finish build", () => {
    const steps = visibleFlowSteps(PRODUCTION_FLOWS.assembly, false);
    expect(steps.map((s) => s.id)).toEqual(["recipe", "job", "complete"]);
  });

  it("assembly full process includes optional stations", () => {
    const steps = visibleFlowSteps(PRODUCTION_FLOWS.assembly, true);
    expect(steps.length).toBeGreaterThan(3);
    expect(steps.some((s) => s.id === "qc")).toBe(true);
  });

  it("highlights assembly recipe on recipes route", () => {
    const flow = PRODUCTION_FLOWS.assembly;
    const idx = activeFlowStepIndex("/app/production/assembly/recipes", "", flow);
    expect(flow.steps[idx]?.id).toBe("recipe");
  });

  it("highlights disassembly weigh-parts", () => {
    const flow = PRODUCTION_FLOWS.disassembly;
    const idx = activeFlowStepIndex("/app/production/weigh-parts", "mode=disassembly", flow);
    expect(flow.steps[idx]?.id).toBe("weigh");
  });

  it("highlights disassembly issue station when mode=disassembly", () => {
    const flow = PRODUCTION_FLOWS.disassembly;
    const idx = activeFlowStepIndex(
      "/app/production/issue-station",
      "mode=disassembly",
      flow,
    );
    expect(flow.steps[idx]?.id).toBe("issue");
  });

  it("highlights assembly issue station", () => {
    const flow = PRODUCTION_FLOWS.assembly;
    const idx = activeFlowStepIndex("/app/production/issue-station", "", flow);
    expect(flow.steps[idx]?.id).toBe("issue");
  });
});
