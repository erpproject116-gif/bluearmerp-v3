import { describe, expect, it } from "vitest";
import { resolveListEmptyState } from "./listEmptyStates";
import { uiCopyFallback } from "./branding/uiCopyCatalog";

const PRIMARY_LISTS = [
  "/app/sales/sales",
  "/app/purchases/purchase-receive",
  "/app/quotation/quotations",
  "/app/sales-order/sales-orders",
  "/app/purchase-order/purchase-orders",
  "/app/inventory/items",
  "/app/inventory/partners",
];

/** Words a non-technical first-time user should never have to decode. */
const JARGON = /\brow\b|\bF2\b|\bgrid\b|\bentity\b|\brecord set\b|\bCRUD\b/i;

describe("list empty states", () => {
  it("covers every primary list in the buy and sell chain", () => {
    const missing = PRIMARY_LISTS.filter((p) => !resolveListEmptyState(p));
    expect(missing, `Lists with no empty-state guidance:\n${missing.join("\n")}`).toEqual([]);
  });

  it("tolerates a trailing slash", () => {
    expect(resolveListEmptyState("/app/sales/sales/")).toEqual(resolveListEmptyState("/app/sales/sales"));
  });

  it("says what is missing and what to do next, without jargon", () => {
    for (const p of PRIMARY_LISTS) {
      const state = resolveListEmptyState(p)!;
      expect(state.headline, `${p} headline`).not.toMatch(JARGON);
      expect(state.nextStep, `${p} next step`).not.toMatch(JARGON);
      // The next step must actually direct the user somewhere.
      expect(state.nextStep, `${p} next step should name an action`).toMatch(
        /Choose|Select|Start|Add|Open/,
      );
    }
  });

  it("warns about the base unit on the items list, because purchases fail without it", () => {
    expect(resolveListEmptyState("/app/inventory/items")?.nextStep).toMatch(/base unit/i);
  });

  it("no longer tells people to press F2", () => {
    expect(uiCopyFallback("common.no_rows")).not.toMatch(/F2/);
    expect(uiCopyFallback("common.no_rows")).toMatch(/New/);
  });

  it("leaves unrelated screens on the shared default", () => {
    expect(resolveListEmptyState("/app/dashboard")).toBeUndefined();
  });
});
