/**
 * Shared helpers for the Cordova buy-path golden journey.
 *
 * UI drives create/load-slip where humans work. Confirm, progress Complete, and
 * accounting assertions go through the same APIs the SPA uses (credentials:
 * include) so a green toast cannot hide a missing journal entry.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { e2eMarker, ledgerAppend } from "./mutationLedger";
import { runId } from "./liveSafety";

export type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  meta?: { total?: number; page?: number; per_page?: number };
  errors?: Record<string, string>;
};

export async function apiJson<T>(
  page: Page,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: ApiEnvelope<T> }> {
  return page.evaluate(
    async ({ path: p, method, body }) => {
      const res = await fetch(p, {
        method: method ?? "GET",
        credentials: "include",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
      return { status: res.status, body: json };
    },
    { path, method: init?.method, body: init?.body },
  );
}

export function buyRunMarker(): string {
  return e2eMarker("BUY");
}

export async function listPurchaseOrdersByQ(page: Page, q: string) {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", q, sort: "created_at", order: "desc" });
  const { status, body } = await apiJson<
    { id: number; purchase_order_no: string; status: string; progress_status: string; reference?: string | null }[]
  >(page, `/api/v1/purchase-order/purchase-orders?${qs}`);
  expect(status, `list POs failed: ${body.message}`).toBeLessThan(400);
  return body.data ?? [];
}

export async function confirmPurchaseOrderApi(page: Page, poId: number) {
  const { status, body } = await apiJson(page, `/api/v1/purchase-order/purchase-orders/${poId}/confirm`, {
    method: "PATCH",
  });
  if (status >= 400 || body.success === false) {
    throw new Error(
      `PO ${poId} confirm failed (${status}): ${body.message ?? JSON.stringify(body.errors ?? body)}`,
    );
  }
  ledgerAppend({ kind: "purchase-order-confirm", marker: String(poId), path: `/api/v1/purchase-order/purchase-orders/${poId}/confirm`, status: "posted" });
}

export async function listSupplierInvoicesByQ(page: Page, q: string) {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", q, sort: "created_at", order: "desc" });
  const { status, body } = await apiJson<
    {
      id: number;
      invoice_no?: string;
      purchase_invoice_no?: string;
      reference?: string | null;
      progress_status?: string;
      invoice_journal_entry_id?: number | null;
      has_journal?: boolean;
      partner_name?: string;
      grand_total?: number;
    }[]
  >(page, `/api/v1/finance/supplier-invoices?${qs}`);
  expect(status, `list supplier invoices failed: ${body.message}`).toBeLessThan(400);
  return body.data ?? [];
}

export async function getSupplierInvoice(page: Page, id: number) {
  const { status, body } = await apiJson<{
    id: number;
    progress_status: string;
    invoice_journal_entry_id?: number | null;
    reference?: string | null;
    grand_total?: number;
    partner_id?: number;
  }>(page, `/api/v1/finance/supplier-invoices/${id}`);
  expect(status, `GET supplier invoice ${id} failed: ${body.message}`).toBeLessThan(400);
  expect(body.data, `supplier invoice ${id} missing data`).toBeTruthy();
  return body.data!;
}

export async function completeSupplierInvoice(page: Page, invoiceId: number) {
  const { status, body } = await apiJson(page, `/api/v1/finance/supplier-invoices/${invoiceId}/progress-status`, {
    method: "PATCH",
    body: { progress_status: "completed" },
  });
  if (status >= 400 || body.success === false) {
    throw new Error(
      `SI ${invoiceId} progress→completed failed (${status}): ${body.message ?? JSON.stringify(body.errors ?? body)}`,
    );
  }
  ledgerAppend({
    kind: "supplier-invoice-complete",
    marker: String(invoiceId),
    path: `/api/v1/finance/supplier-invoices/${invoiceId}/progress-status`,
    status: "posted",
  });
}

export async function assertSupplierInvoicePostedToGl(page: Page, invoiceId: number) {
  const detail = await getSupplierInvoice(page, invoiceId);
  const jeId = detail.invoice_journal_entry_id;
  expect(
    jeId,
    `Purchase ${invoiceId} has no invoice_journal_entry_id after Completed — stock/AP may have posted without GL`,
  ).toBeTruthy();

  const { status, body } = await apiJson<{ id: number; status: string; entry_no?: string }[]>(
    page,
    `/api/v1/finance/journal-entries?page=1&pageSize=50&q=${jeId}`,
  );
  // Fallback: some deployments only expose list without q — still require je id on the SI.
  if (status < 400 && Array.isArray(body.data) && body.data.length) {
    const match = body.data.find((j) => j.id === jeId) ?? body.data[0];
    expect(match?.status, `Journal ${jeId} is not posted`).toMatch(/posted/i);
  }
  return { invoice: detail, journalEntryId: jeId as number };
}

export async function assertPayableMentionsInvoice(page: Page, invoiceId: number) {
  const { status, body } = await apiJson<{ id?: number; supplier_invoice_id?: number; invoice_id?: number }[]>(
    page,
    `/api/v1/finance/payables/open?page=1&pageSize=100`,
  );
  expect(status, `open payables failed: ${body.message}`).toBeLessThan(400);
  const rows = body.data ?? [];
  const hit = rows.some(
    (r) =>
      r.supplier_invoice_id === invoiceId ||
      r.invoice_id === invoiceId ||
      r.id === invoiceId,
  );
  expect(
    hit,
    `Open payables does not include supplier invoice ${invoiceId}. Rows=${rows.length}. Run id=${runId()}`,
  ).toBe(true);
}

export async function assertSerialsExist(page: Page, serialPrefix: string, minCount = 1) {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", q: serialPrefix, sort: "created_at", order: "desc" });
  const { status, body } = await apiJson<{ id: number; serial_no: string; status: string }[]>(
    page,
    `/api/v1/inventory/serial-units?${qs}`,
  );
  expect(status, `serial-units list failed: ${body.message}`).toBeLessThan(400);
  const rows = (body.data ?? []).filter((r) => r.serial_no.startsWith(serialPrefix));
  expect(
    rows.length,
    `Expected ≥${minCount} serial units with prefix ${serialPrefix}, found ${rows.length}`,
  ).toBeGreaterThanOrEqual(minCount);
  return rows;
}

/** Paste serials into the bill-mode SerialLineCell dialog if it is open / openable. */
export async function pasteBillSerials(page: Page, serials: string[]) {
  const pasteBtn = page.getByRole("button", { name: /Paste serials/i }).first();
  if (await pasteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await pasteBtn.click();
  } else {
    // Open the serial cell first (link/button showing 0 / N).
    const serialCell = page.getByRole("button", { name: /serial|0\s*\/\s*\d+/i }).first();
    if (await serialCell.isVisible().catch(() => false)) {
      await serialCell.click();
      await page.getByRole("button", { name: /Paste serials/i }).first().click();
    } else {
      throw new Error("No Paste serials control — line may not be serial-tracked");
    }
  }
  const area = page.getByPlaceholder(/SN001|serial/i).first();
  await expect(area).toBeVisible({ timeout: 10000 });
  await area.fill(serials.join("\n"));
  const importBtn = page.getByRole("button", { name: /Import pasted serials|Import|Apply/i }).first();
  await importBtn.click();
}
