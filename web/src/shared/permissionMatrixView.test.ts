import { describe, expect, it } from "vitest";
import type { PermissionModuleGroup } from "./usePermissions";
import {
  orderPermissionGroups,
  permissionHiddenByFeature,
  permissionModuleLabel,
  visibleGroupPermissions,
} from "./permissionMatrixView";

const inventory: PermissionModuleGroup = {
  module_code: "inventory",
  module_label: "Inventory",
  permissions: [
    { permission_code: "inventory.items", module_code: "inventory", label: "Items", sort_order: 1 },
    { permission_code: "inventory.serial_registry", module_code: "inventory", feature_key: "serial_registry", label: "Serial Registry", sort_order: 2 },
  ],
};

describe("permission matrix view", () => {
  it("uses plain app names instead of codes", () => {
    expect(permissionModuleLabel("after_sales", "after_sales")).toBe("After-Sales");
    expect(permissionModuleLabel("pos", "pos")).toBe("Point of Sale");
    expect(permissionModuleLabel("hr", "hr")).toBe("HR");
    expect(permissionModuleLabel("data_center", "data_center")).toBe("Data Center");
    expect(permissionModuleLabel("inventory", "Inventory")).toBe("Inventory");
  });

  it("orders modules like Apps and features", () => {
    const ordered = orderPermissionGroups([
      { module_code: "user_management", module_label: "Users", permissions: [] },
      { module_code: "finance", module_label: "Finance", permissions: [] },
      { module_code: "inventory", module_label: "Inventory", permissions: [] },
      { module_code: "quotation", module_label: "Quotation", permissions: [] },
    ]);
    expect(ordered.map((g) => g.module_code)).toEqual(["inventory", "quotation", "finance", "user_management"]);
  });

  it("hides a disabled feature without listing its codes for bulk edit", () => {
    const enabled = new Set(["inventory"]);
    expect(permissionHiddenByFeature("inventory.serial_registry", enabled)).toBe(true);
    const visible = visibleGroupPermissions(inventory, {
      enabled,
      query: "",
      filter: "all",
      values: {
        "inventory.items": "write",
        "inventory.serial_registry": "read",
      },
    });
    expect(visible.map((p) => p.permission_code)).toEqual(["inventory.items"]);
  });

  it("keeps a feature row when that feature is on", () => {
    const visible = visibleGroupPermissions(inventory, {
      enabled: new Set(["inventory", "inventory.serial_lot"]),
      query: "serial",
      filter: "allowed",
      values: {
        "inventory.items": "deny",
        "inventory.serial_registry": "read",
      },
    });
    expect(visible.map((p) => p.permission_code)).toEqual(["inventory.serial_registry"]);
  });
});
