/**
 * Quick-create surfaces (ComboSearchBox + create).
 *
 * Surfaces → entityKey (audit checklist):
 * - OfficialReceiptModal / PaymentVoucherModal / Sales|Quotation|SO|PO|SI partner → partner
 * - ItemSearchModal / SalesItemSearchModal / Quotation|SO item search → item
 * - Document location lookups (Sales, SO, Quotation, PR, PO, …) → location
 * - Document tax type lookups → tax_type
 * - HrEmployeesPage department → department
 *
 * Excluded: status/terms/currency/PIC/user/filter bar selects.
 */
export type QuickCreateEntityKey = "partner" | "item" | "location" | "tax_type" | "department";

export type QuickCreateDef = {
  entityKey: QuickCreateEntityKey;
  createLabel: string;
  /** Permission code checked with hasPermission(..., "write"). */
  permission: string;
};

export const QUICK_CREATE_REGISTRY: Record<QuickCreateEntityKey, QuickCreateDef> = {
  partner: {
    entityKey: "partner",
    createLabel: "Add partner",
    permission: "inventory.partners",
  },
  item: {
    entityKey: "item",
    createLabel: "Add new item",
    permission: "inventory.items",
  },
  location: {
    entityKey: "location",
    createLabel: "Add location",
    permission: "inventory.locations",
  },
  tax_type: {
    entityKey: "tax_type",
    createLabel: "Add tax type",
    permission: "quotation.tax_types",
  },
  department: {
    entityKey: "department",
    createLabel: "Add department",
    permission: "hr.employees",
  },
};

export function quickCreateLabel(key: QuickCreateEntityKey, override?: string): string {
  return override ?? QUICK_CREATE_REGISTRY[key].createLabel;
}
