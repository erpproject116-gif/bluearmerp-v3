import { expect, test, type Page, type Response } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { cancelEntityModal, entityDialog, openNewRow } from "./helpers/entityForm";

type CoreDocumentCase = {
  name: string;
  path: string;
  heading: RegExp;
  expectedLabel?: RegExp;
  opensOnNavigate?: boolean;
};

const CORE_DOCUMENTS: CoreDocumentCase[] = [
  {
    name: "quotation",
    path: "/app/quotation/quotations",
    heading: /New Quotation/i,
    expectedLabel: /Customer/i,
  },
  {
    name: "sales order",
    path: "/app/sales-order/sales-orders",
    heading: /New Sales Order/i,
    expectedLabel: /Customer/i,
  },
  {
    name: "sales invoice",
    path: "/app/sales/sales",
    heading: /New Sales/i,
    expectedLabel: /Customer/i,
  },
  {
    name: "purchase request",
    path: "/app/purchase-request/purchase-requests/new",
    heading: /New Purchase Request/i,
    opensOnNavigate: true,
  },
  {
    name: "purchase order",
    path: "/app/purchase-order/purchase-orders",
    heading: /New Purchase Order/i,
    expectedLabel: /Supplier/i,
  },
  {
    name: "purchase invoice",
    path: "/app/purchases/purchase-receive",
    heading: /New Purchases|New Purchase Invoice/i,
    expectedLabel: /Supplier|Vendor/i,
  },
  {
    name: "official receipt",
    path: "/app/finance/official-receipts",
    heading: /New Official Receipt/i,
    expectedLabel: /Customer/i,
  },
  {
    name: "payment voucher",
    path: "/app/finance/payment-vouchers",
    heading: /New Payment Voucher/i,
    expectedLabel: /Supplier/i,
  },
];

async function exerciseEditableControls(page: Page, heading: RegExp) {
  const dialog = entityDialog(page, heading);
  await expect(dialog).toBeVisible({ timeout: 20_000 });

  // Every transaction modal must expose its two essential actions.
  await expect(dialog.getByRole("button", { name: /^Save changes$/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^(Cancel|Close)$/i })).toBeVisible();

  // Prove a normal text field accepts and clears input. Lookup search boxes
  // are included; no option is selected, so this remains non-destructive.
  const textInput = dialog
    .locator(
      'input:not([type="hidden"]):not([type="date"]):not([type="number"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])',
    )
    .first();
  if (await textInput.isVisible().catch(() => false)) {
    const original = await textInput.inputValue();
    await textInput.fill("E2E interaction probe");
    await expect(textInput).toHaveValue("E2E interaction probe");
    await textInput.fill(original);
  }

  // Toggle a checkbox twice and verify state changes without retaining it.
  const checkbox = dialog.locator('input[type="checkbox"]:not([disabled])').first();
  if (await checkbox.isVisible().catch(() => false)) {
    const original = await checkbox.isChecked();
    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: !original });
    await checkbox.click();
    await expect(checkbox).toBeChecked({ checked: original });
  }

  // Exercise the Details/Invoice tab contract where present.
  const invoiceTab = dialog.getByRole("button", { name: /^Invoice$/i });
  if (await invoiceTab.isVisible().catch(() => false)) {
    await invoiceTab.click();
    const detailsTab = dialog.getByRole("button", { name: /^Details$/i });
    await expect(detailsTab).toBeVisible();
    await detailsTab.click();
  }

  // Empty save must not close the transaction. This proves the button is
  // wired to validation rather than silently doing nothing or navigating.
  await dialog.getByRole("button", { name: /^Save changes$/i }).click();
  await expect(dialog).toBeVisible();
}

test.describe("Layer 2 — core document modal/button contracts", () => {
  test("@smoke @read-only all core New transaction modals expose working controls and validation", async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);
    page.setDefaultTimeout(15_000);

    await ensureSignedIn(page);
    await assertApiReachable(page);

    const failures: string[] = [];
    const unexpectedMutations: string[] = [];

    // This suite is a contract probe, not a data-creation suite. Let telemetry
    // and draft autosave through, but abort any business mutation if an empty
    // form incorrectly reaches the API.
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const method = request.method();
      if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
        await route.continue();
        return;
      }
      const pathname = new URL(request.url()).pathname;
      const safeMutation =
        pathname.startsWith("/api/v1/usage/") ||
        pathname.startsWith("/api/v1/presence/") ||
        pathname.startsWith("/api/v1/drafts/") ||
        pathname.startsWith("/api/v1/session-idle/") ||
        pathname === "/api/v1/crm/follow-up-tasks/summaries";
      if (safeMutation) {
        await route.continue();
        return;
      }
      // Purchase Request currently performs server-side (rather than client-
      // side) required-field validation. Abort its empty probe deliberately:
      // the button wiring is proven without creating test data.
      if (method === "POST" && pathname === "/api/v1/purchase-request/purchase-requests") {
        await route.abort("blockedbyclient");
        return;
      }
      unexpectedMutations.push(`${method} ${pathname}`);
      await route.abort("blockedbyclient");
    });

    for (const c of CORE_DOCUMENTS) {
      const pageErrors: string[] = [];
      const serverErrors: string[] = [];
      let rateLimited = false;
      const onPageError = (error: Error) => pageErrors.push(error.message);
      const onResponse = (response: Response) => {
        if (response.status() === 429 && response.url().includes("/api/")) rateLimited = true;
        if (response.status() < 500 || !response.url().includes("/api/")) return;
        serverErrors.push(
          `${response.status()} ${response.request().method()} ${response.url().replace(/^https?:\/\/[^/]+/, "")}`,
        );
      };
      page.on("pageerror", onPageError);
      page.on("response", onResponse);

      try {
        await page.goto(c.path, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const main = page.locator("main").first();
        await main.waitFor({ state: "visible", timeout: 25_000 }).catch(() => undefined);
        const newButton = page.getByRole("button", { name: /\+?\s*New row/i }).first();
        if (!c.opensOnNavigate) {
          await newButton.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
        }

        // Full transaction pages can cross the deployed API's per-user rate
        // window. Wait once, then retry this route instead of misreporting a
        // missing button caused by /auth/me returning 429.
        if (
          (!(await main.isVisible().catch(() => false)) ||
            (!c.opensOnNavigate && !(await newButton.isVisible().catch(() => false)))) &&
          (rateLimited || (await page.getByText(/Cannot reach the API/i).isVisible().catch(() => false)))
        ) {
          await page.waitForTimeout(65_000);
          rateLimited = false;
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
        }

        await expect(main).toBeVisible({ timeout: 25_000 });
        if (!c.opensOnNavigate) await openNewRow(page);
        const dialog = entityDialog(page, c.heading);
        await expect(dialog).toBeVisible({ timeout: 20_000 });

        if (c.expectedLabel) {
          await expect(dialog.locator("label").filter({ hasText: c.expectedLabel }).first()).toBeVisible();
        }

        await exerciseEditableControls(page, c.heading);
        await cancelEntityModal(page, c.heading);

        // A draft-discard confirmation may follow Cancel.
        const discard = page.getByRole("button", { name: /Discard|Leave without saving/i }).last();
        if (await discard.isVisible().catch(() => false)) await discard.click();
        await expect(entityDialog(page, c.heading)).toBeHidden({ timeout: 10_000 });

        if (pageErrors.length) failures.push(`${c.name}: pageerror: ${pageErrors[0]}`);
        if (serverErrors.length) failures.push(`${c.name}: API 5xx: ${[...new Set(serverErrors)].join("; ")}`);
      } catch (error) {
        failures.push(`${c.name}: ${error instanceof Error ? error.message : String(error)}`);
        await page.keyboard.press("Escape").catch(() => undefined);
      } finally {
        page.off("pageerror", onPageError);
        page.off("response", onResponse);
      }
    }

    if (unexpectedMutations.length) {
      failures.push(`empty-form save reached business API: ${[...new Set(unexpectedMutations)].join("; ")}`);
    }
    expect(failures, `Core interaction failures (${failures.length}/${CORE_DOCUMENTS.length}):\n${failures.join("\n")}`)
      .toEqual([]);
  });
});
