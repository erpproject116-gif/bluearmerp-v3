import { describe, expect, it } from "vitest";
import type { TenantModuleRow } from "../../../shared/moduleAccess";
import {
  applyModuleToggle,
  applyPresetToRows,
  catalogNodes,
  filterRows,
  missingDependenciesForTurnOn,
} from "./tenantModulesDraft";

function row(
  partial: Partial<TenantModuleRow> & Pick<TenantModuleRow, "module_code" | "module_name">,
): TenantModuleRow {
  return {
    module_type: "tenant",
    is_enabled: false,
    depends_on: [],
    can_toggle: true,
    ...partial,
  };
}

describe("applyModuleToggle", () => {
  const base: TenantModuleRow[] = [
    row({ module_code: "inventory", module_name: "Inventory", is_enabled: true }),
    row({
      module_code: "inventory.serial_lot",
      module_name: "Serial & Lot",
      module_type: "feature",
      parent_module: "inventory",
      depends_on: ["inventory"],
      is_enabled: true,
    }),
    row({
      module_code: "inventory.wms",
      module_name: "WMS",
      module_type: "feature",
      parent_module: "inventory",
      depends_on: ["inventory"],
      is_enabled: false,
    }),
    row({ module_code: "pos", module_name: "POS", is_enabled: true, depends_on: ["inventory", "sales"] }),
    row({ module_code: "sales", module_name: "Sales", is_enabled: true }),
  ];

  it("turning parent off cascades features off in draft", () => {
    const result = applyModuleToggle(base, "inventory");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.find((r) => r.module_code === "inventory")?.is_enabled).toBe(false);
    expect(result.rows.find((r) => r.module_code === "inventory.serial_lot")?.is_enabled).toBe(false);
    expect(result.rows.find((r) => r.module_code === "inventory.wms")?.is_enabled).toBe(false);
    expect(result.dependentsStillOn.map((r) => r.module_code)).toContain("pos");
  });

  it("turning parent on does not force features on", () => {
    const off = applyModuleToggle(base, "inventory");
    expect(off.ok).toBe(true);
    if (!off.ok) return;
    const backOn = applyModuleToggle(off.rows, "inventory");
    expect(backOn.ok).toBe(true);
    if (!backOn.ok) return;
    expect(backOn.rows.find((r) => r.module_code === "inventory")?.is_enabled).toBe(true);
    expect(backOn.rows.find((r) => r.module_code === "inventory.serial_lot")?.is_enabled).toBe(false);
  });

  it("blocks turn on when dependencies are off", () => {
    const rows = [
      row({ module_code: "inventory", module_name: "Inventory", is_enabled: false }),
      row({ module_code: "sales", module_name: "Sales", is_enabled: true }),
      row({ module_code: "pos", module_name: "POS", is_enabled: false, depends_on: ["inventory", "sales"] }),
    ];
    const result = applyModuleToggle(rows, "pos");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missingDeps.map((r) => r.module_code)).toEqual(["inventory"]);
  });
});

describe("missingDependenciesForTurnOn", () => {
  it("returns empty when deps satisfied", () => {
    const rows = [
      row({ module_code: "inventory", module_name: "Inventory", is_enabled: true }),
      row({
        module_code: "inventory.wms",
        module_name: "WMS",
        module_type: "feature",
        depends_on: ["inventory"],
        is_enabled: false,
      }),
    ];
    expect(missingDependenciesForTurnOn(rows, "inventory.wms")).toEqual([]);
  });
});

describe("applyPresetToRows", () => {
  it("simple_store keeps sales on and turns quotation off", () => {
    const rows = [
      row({ module_code: "sales", module_name: "Sales", is_enabled: false }),
      row({ module_code: "quotation", module_name: "Quotation", is_enabled: true }),
      row({ module_code: "pos", module_name: "POS", is_enabled: false }),
    ];
    const next = applyPresetToRows(rows, "simple_store");
    expect(next.find((r) => r.module_code === "sales")?.is_enabled).toBe(true);
    expect(next.find((r) => r.module_code === "quotation")?.is_enabled).toBe(false);
    expect(next.find((r) => r.module_code === "pos")?.is_enabled).toBe(true);
  });
});

describe("catalogNodes", () => {
  it("nests features under parent", () => {
    const items = [
      row({ module_code: "inventory", module_name: "Inventory" }),
      row({
        module_code: "inventory.wms",
        module_name: "WMS",
        module_type: "feature",
        parent_module: "inventory",
        depends_on: ["inventory"],
      }),
    ];
    const nodes = catalogNodes(items);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].parent.module_code).toBe("inventory");
    expect(nodes[0].features.map((f) => f.module_code)).toEqual(["inventory.wms"]);
  });
});

describe("filterRows", () => {
  it("matches display name and code", () => {
    const rows = [
      row({ module_code: "pos", module_name: "POS" }),
      row({ module_code: "finance", module_name: "Finance" }),
    ];
    expect(filterRows(rows, "point").map((r) => r.module_code)).toEqual(["pos"]);
    expect(filterRows(rows, "FINANCE").map((r) => r.module_code)).toEqual(["finance"]);
  });
});
