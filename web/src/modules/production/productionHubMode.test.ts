import { describe, expect, it } from "vitest";
import { inferMfgModeFromPath } from "./productionHubMode";

describe("productionHubMode", () => {
  it("infers assembly from assembly routes", () => {
    expect(inferMfgModeFromPath("/app/production/assembly/jobs")).toBe("assembly");
  });

  it("infers disassembly from disassembly routes", () => {
    expect(inferMfgModeFromPath("/app/production/disassembly/recipes")).toBe("disassembly");
  });

  it("infers disassembly receive station from mode query", () => {
    expect(inferMfgModeFromPath("/app/production/receive-station", "mode=disassembly")).toBe(
      "disassembly",
    );
  });

  it("infers assembly issue station by default", () => {
    expect(inferMfgModeFromPath("/app/production/issue-station")).toBe("assembly");
  });
});
