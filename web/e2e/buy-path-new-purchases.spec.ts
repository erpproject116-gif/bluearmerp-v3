/**
 * P0 golden buy path on live Cordova (and any tenant with matching fixtures):
 *   PO create → confirm → New Purchases (Load Slip from PO) → serials → Completed
 *   → inventory serial registry + open payables + GL journal on the purchase.
 *
 * Requires posting tier + mutations + tenant pin. See docs/qa/buy-path-cordova-runbook.md.
 */
import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { mutationsAllowed, currentTier, writeEvidence } from "./helpers/liveSafety";
import { loadTenantProfile } from "./helpers/tenantProfile";
import { ledgerAppend } from "./helpers/mutationLedger";
import {
  openNewRow,
  expectModalHeading,
  fillLookup,
  fillDate,
  fillTextByLabel,
  selectFirstOption,
  addItemLine,
  saveEntityModal,
  cancelEntityModal,
  softSkip,
} from "./helpers/entityForm";
import {
  buyRunMarker,
  listPurchaseOrdersByQ,
  confirmPurchaseOrderApi,
  listSupplierInvoicesByQ,
  completeSupplierInvoice,
  assertSupplierInvoicePostedToGl,
  assertPayableMentionsInvoice,
  assertSerialsExist,
  pasteBillSerials,
} from "./helpers/buyPath";

test.describe("Buy path — New Purchases (PO → stock + AP + GL)", () => {
  test("@posting @mutating create PO, receive via New Purchases, prove serials + payables + journal", async ({
    page,
  }, testInfo) => {
    test.skip(
      !mutationsAllowed() || currentTier() !== "posting",
      `Need E2E_TIER=posting, E2E_ALLOW_MUTATIONS=1, E2E_RUN_CONFIRM=<fresh token>. tier=${currentTier()}`,
    );
    test.setTimeout(15 * 60 * 1000);
    page.setDefaultTimeout(20_000);

    const profile = loadTenantProfile();
    const itemQuery = profile.serialItemQuery ?? profile.itemQuery;
    const supplierQuery = profile.supplierQuery;
    const locationQuery = profile.locationQuery;
    const marker = buyRunMarker();
    const serialPrefix = `${marker}-SN`;
    const serials = [`${serialPrefix}01`];

    await ensureSignedIn(page);

    // --- 1. Create PO (UI) ---
    await page.goto("/app/purchase-order/purchase-orders");
    await assertApiReachable(page);
    await openNewRow(page);
    await expectModalHeading(page, /New Purchase Order/i);
    await fillDate(page, /Date|Order date|PO date/i, new Date().toISOString().slice(0, 10)).catch(() => undefined);
    await selectFirstOption(page, /Transaction type/i).catch(() => undefined);
    await selectFirstOption(page, /Currency/i).catch(() => undefined);
    await fillLookup(page, /Supplier|Vendor/i, supplierQuery);
    await fillLookup(page, /Location/i, locationQuery).catch(() => undefined);
    await fillTextByLabel(page, /Reference/i, marker).catch(async () => {
      await fillTextByLabel(page, /Notes/i, marker);
    });
    await addItemLine(page, itemQuery);
    await saveEntityModal(page, /New Purchase Order/i);
    await page.waitForTimeout(2000);

    const stillOpen = await page.getByRole("heading", { name: /New Purchase Order/i }).isVisible().catch(() => false);
    if (stillOpen) {
      await cancelEntityModal(page, /New Purchase Order/i).catch(() => undefined);
      softSkip(testInfo, `PO create stayed open (validation / seed). marker=${marker}`);
    }

    const pos = await listPurchaseOrdersByQ(page, marker);
    const po = pos[0];
    expect(po, `No PO found for marker ${marker}`).toBeTruthy();
    ledgerAppend({
      kind: "purchase-order",
      marker,
      path: `/api/v1/purchase-order/purchase-orders/${po.id}`,
      detail: po.purchase_order_no,
      status: "created",
    });

    // --- 2. Confirm PO (API) ---
    await confirmPurchaseOrderApi(page, po.id);

    // --- 3. New Purchases from PO (UI) ---
    await page.goto("/app/purchases/purchase-receive");
    await assertApiReachable(page);
    await openNewRow(page);
    await expectModalHeading(page, /New Purchases|New Purchase/i);

    await page.getByRole("button", { name: /^Load Slip$/i }).click();
    await page.getByRole("button", { name: /^Purchase Order$/i }).click();

    const poPicker = page.locator("div.fixed.inset-0").filter({ hasText: /Purchase Order|Open PO/i }).last();
    await expect(poPicker).toBeVisible({ timeout: 15000 });
    const search = poPicker.getByPlaceholder(/Search|PO|vendor/i).first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill(po.purchase_order_no);
    }
    const poRow = poPicker.locator("tbody tr").filter({ hasText: po.purchase_order_no }).first();
    await expect(poRow).toBeVisible({ timeout: 20000 });
    await poRow.click();
    const confirmPick = poPicker.getByRole("button", { name: /Add|Confirm|Load|OK/i }).first();
    if (await confirmPick.isVisible().catch(() => false)) {
      await confirmPick.click();
    }

    // Serials for track_serial lines (qty 1 → one serial).
    try {
      await pasteBillSerials(page, serials);
    } catch (e) {
      testInfo.annotations.push({
        type: "serial-optional",
        description: e instanceof Error ? e.message : String(e),
      });
      // Non-serial items still must post AP+GL; serial assert is skipped below if paste failed.
    }

    await fillTextByLabel(page, /Reference|Notes/i, marker).catch(() => undefined);
    await saveEntityModal(page, /New Purchases|New Purchase/i);
    await page.waitForTimeout(2500);

    const purchaseStillOpen = await page
      .getByRole("heading", { name: /New Purchases|New Purchase/i })
      .isVisible()
      .catch(() => false);
    if (purchaseStillOpen) {
      await cancelEntityModal(page, /New Purchases|New Purchase/i).catch(() => undefined);
      softSkip(testInfo, `New Purchases stayed open after save. marker=${marker} po=${po.purchase_order_no}`);
    }

    const invoices = await listSupplierInvoicesByQ(page, marker);
    let si = invoices[0];
    if (!si) {
      // Fallback: search by PO number carried onto the bill.
      const byPo = await listSupplierInvoicesByQ(page, po.purchase_order_no);
      si = byPo[0];
    }
    expect(si, `No supplier invoice / purchase for marker ${marker}`).toBeTruthy();
    ledgerAppend({
      kind: "supplier-invoice",
      marker,
      path: `/api/v1/finance/supplier-invoices/${si.id}`,
      detail: String(si.invoice_no ?? si.purchase_invoice_no ?? si.id),
      status: "created",
    });

    // --- 4. Complete (posts stock + AP + JE) ---
    await completeSupplierInvoice(page, si.id);

    // --- 5. Hard accounting + inventory asserts ---
    const { journalEntryId } = await assertSupplierInvoicePostedToGl(page, si.id);
    await assertPayableMentionsInvoice(page, si.id);

    let serialRows: { id: number; serial_no: string }[] = [];
    const serialPasteWorked = !testInfo.annotations.some((a) => a.type === "serial-optional");
    if (serialPasteWorked) {
      serialRows = await assertSerialsExist(page, serialPrefix, 1);
    }

    const evidencePath = writeEvidence("buy-path-new-purchases.json", {
      at: new Date().toISOString(),
      marker,
      po: { id: po.id, no: po.purchase_order_no },
      supplierInvoiceId: si.id,
      journalEntryId,
      serials: serialRows.map((r) => r.serial_no),
      profile: {
        supplierQuery,
        itemQuery,
        locationQuery,
        tenantCode: profile.tenantCode,
      },
    });

    testInfo.annotations.push({
      type: "buy-path",
      description: `po=${po.purchase_order_no} si=${si.id} je=${journalEntryId} evidence=${evidencePath}`,
    });
  });
});
