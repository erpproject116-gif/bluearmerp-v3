/**
 * Deep journey — posting GR via serial/lot receive station.
 * Live: requires E2E_TIER=posting + E2E_ALLOW_MUTATIONS=1.
 *
 * This path posts inventory (and may auto-create a purchase invoice). It does
 * NOT claim the same GL proof as buy-path-new-purchases.spec.ts unless the
 * auto-created SI carries invoice_journal_entry_id — that is checked softly.
 *
 * Needs tenant-profile openPoCodes of confirmed POs still open for receive.
 */
import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { softSkip } from "./helpers/entityForm";
import { mutationsAllowed, currentTier, writeEvidence } from "./helpers/liveSafety";
import { loadTenantProfile } from "./helpers/tenantProfile";
import { ledgerAppend } from "./helpers/mutationLedger";
import { assertSerialsExist, getSupplierInvoice, listSupplierInvoicesByQ } from "./helpers/buyPath";

test.describe("Goods receipt receive", () => {
  test("@read-only receive page shell loads and PO lookup is visible", async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await ensureSignedIn(page);
    await page.goto("/app/inventory/serial-lot/receive");
    await assertApiReachable(page);
    try {
      await expect(page.getByRole("heading", { name: /Receive \/ Scan Serials/i })).toBeVisible({
        timeout: 15000,
      });
    } catch {
      softSkip(testInfo, "Serial/lot receive heading not visible (module or permission)");
    }
    await expect(page.getByLabel(/Purchase order/i)).toBeVisible({ timeout: 10000 });
  });

  test("@posting @mutating create draft GR from open PO, paste serials, and post", async ({ page }, testInfo) => {
    test.skip(
      !mutationsAllowed() || currentTier() !== "posting",
      "Set E2E_TIER=posting, E2E_ALLOW_MUTATIONS=1, E2E_RUN_CONFIRM=<id>",
    );
    test.setTimeout(120_000);

    const profile = loadTenantProfile();
    const openCodes = (profile.openPoCodes ?? []).filter(Boolean);
    if (!openCodes.length) {
      softSkip(
        testInfo,
        "tenant profile openPoCodes is empty — confirm a PO and add its purchase_order_no to tenant-profile.local.json",
      );
    }
    const candidates = openCodes.map((po) => ({ po, serials: 1 }));
    const serialPrefix = `E2E-GR-${Date.now()}-SN`;

    await ensureSignedIn(page);
    await page.goto("/app/inventory/serial-lot/receive");
    await assertApiReachable(page);
    await expect(page.getByRole("heading", { name: /Receive \/ Scan Serials/i })).toBeVisible({ timeout: 15000 });

    let used: { po: string; serials: number } | null = null;
    for (const c of candidates) {
      const poInput = page.getByLabel(/Purchase order/i);
      await poInput.click();
      await poInput.fill("");
      await poInput.fill(c.po);
      const poOption = page.getByRole("button", { name: new RegExp(c.po) }).first();
      if (!(await poOption.isVisible().catch(() => false))) continue;
      await poOption.click();
      await expect(page.getByText(/Location:/i)).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "Create goods receipt" }).click();
      const grLabel = page.getByText(/Goods receipt:/i);
      try {
        await expect(grLabel).toBeVisible({ timeout: 15000 });
        used = c;
        break;
      } catch {
        const clear = page.getByRole("button", { name: /Clear|Reset/i }).first();
        if (await clear.isVisible().catch(() => false)) await clear.click();
      }
    }

    if (!used) {
      softSkip(testInfo, `No open PO matched openPoCodes=${openCodes.join(",")}`);
    }

    const serials = Array.from({ length: used!.serials }, (_, i) => `${serialPrefix}${String(i + 1).padStart(2, "0")}`);
    await expect(page.getByText(new RegExp(`PO:.*${used!.po}`))).toBeVisible();

    await page.getByRole("button", { name: "Paste serials" }).click();
    await page.getByPlaceholder(/SN001/i).fill(serials.join("\n"));
    await page.getByRole("button", { name: "Import pasted serials" }).click();

    const postBtn = page.getByRole("button", { name: "Post goods receipt" });
    await expect(postBtn).toBeEnabled({ timeout: 30000 });
    await postBtn.click();

    await expect(page.getByText(/Goods receipt posted/i)).toBeVisible({ timeout: 15000 });
    ledgerAppend({
      kind: "goods-receipt",
      marker: serialPrefix,
      path: "/app/inventory/serial-lot/receive",
      detail: `po=${used!.po}`,
      status: "posted",
    });

    await page.goto("/app/purchases/purchase-receive?view=history&from=goods-receipt");
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder(/Search PO no|Search/i).fill(used!.po);
    await expect(page.getByRole("cell", { name: used!.po })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Posted").first()).toBeVisible({ timeout: 10000 });

    const serialRows = await assertSerialsExist(page, serialPrefix, used!.serials);

    // Soft GL note: auto SI may exist; only record JE when present — do not fail the GR path on it.
    let autoSiJe: number | null = null;
    const invoices = await listSupplierInvoicesByQ(page, used!.po);
    if (invoices[0]) {
      const detail = await getSupplierInvoice(page, invoices[0].id).catch(() => null);
      autoSiJe = detail?.invoice_journal_entry_id ?? null;
    }

    writeEvidence("buy-path-serial-lot-gr.json", {
      at: new Date().toISOString(),
      po: used!.po,
      serialPrefix,
      serials: serialRows.map((r) => r.serial_no),
      autoSupplierInvoiceJeId: autoSiJe,
      note:
        autoSiJe != null
          ? "Auto SI after GR carries a journal entry id"
          : "GR posted stock/serials; GL proof for AP remains on New Purchases Completed path",
    });
  });
});
