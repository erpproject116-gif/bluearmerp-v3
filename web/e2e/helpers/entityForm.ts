import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Setup could not run (missing grid / auth / seed). Fail honestly — never hide as a skip/pass.
 * Annotation `needs-seed` lets CI triage without treating the run as green.
 */
export function softSkip(
  testInfo: { annotations: { type: string; description?: string }[] },
  reason: string,
): never {
  testInfo.annotations.push({ type: "needs-seed", description: reason });
  throw new Error(`QA blocked (needs seed/setup): ${reason}`);
}

/** Create path incomplete after Cancel/Edit already passed — still a finding, not a silent pass. */
export function noteIncomplete(
  testInfo: { annotations: { type: string; description?: string }[] },
  reason: string,
): never {
  testInfo.annotations.push({ type: "incomplete-create", description: reason });
  throw new Error(`QA incomplete create: ${reason}`);
}

export async function openNewRow(page: Page) {
  const btn = page.getByRole("button", { name: /\+?\s*New row/i }).first();
  await expect(btn).toBeVisible({ timeout: 20000 });
  await btn.click();
}

/** Locate a modal/dialog that contains the given heading text. */
export function entityDialog(page: Page, heading: RegExp | string) {
  return page
    .locator("div.fixed.inset-0")
    .filter({ has: page.getByRole("heading", { name: heading }) })
    .last();
}

export async function cancelEntityModal(page: Page, heading?: RegExp | string) {
  const scope = heading ? entityDialog(page, heading) : page.locator("div.fixed.inset-0").last();
  await scope.getByRole("button", { name: /^(Cancel|Close)$/i }).click();
}

export async function saveEntityModal(page: Page, heading?: RegExp | string) {
  const scope = heading ? entityDialog(page, heading) : page.locator("div.fixed.inset-0").last();
  await scope.getByRole("button", { name: /^Save changes$/i }).click();
}

/** Fill a LookupCombo / ModalLookupField by its visible label. */
export async function fillLookup(page: Page, label: RegExp | string, query: string, optionMatch?: RegExp | string) {
  const labelRe = typeof label === "string" ? new RegExp(label, "i") : label;
  const field = page.locator("label").filter({ hasText: labelRe }).last();
  await expect(field).toBeVisible({ timeout: 10000 });
  const input = field.getByRole("textbox");
  await input.click();
  await input.fill(query);
  const optRe =
    optionMatch == null
      ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
      : typeof optionMatch === "string"
        ? new RegExp(optionMatch, "i")
        : optionMatch;
  const option = page.locator("ul li button").filter({ hasText: optRe }).first();
  try {
    await expect(option).toBeVisible({ timeout: 8000 });
  } catch {
    throw new Error(`Lookup "${String(label)}" has no option matching ${String(optRe)} for query "${query}"`);
  }
  await option.click();
}

/** Fill native date input associated with a Field / ModalField label. */
export async function fillDate(page: Page, label: RegExp | string, ymd: string) {
  const labelRe = typeof label === "string" ? new RegExp(`^${label}`, "i") : label;
  const field = page.locator("label").filter({ hasText: labelRe }).first();
  await expect(field).toBeVisible({ timeout: 15000 });
  const input = field.locator('input[type="date"]');
  await input.fill(ymd);
}

/** Select option in a native <select> under a labeled field. */
export async function selectByLabel(page: Page, label: RegExp | string, optionText: RegExp | string) {
  const labelRe = typeof label === "string" ? new RegExp(label, "i") : label;
  const field = page.locator("label").filter({ hasText: labelRe }).first();
  await expect(field).toBeVisible({ timeout: 15000 });
  const select = field.locator("select");
  await expect(select).toBeVisible({ timeout: 10000 });
  const opt =
    typeof optionText === "string"
      ? select.locator("option", { hasText: optionText }).first()
      : select.locator("option").filter({ hasText: optionText }).first();
  const value = await opt.getAttribute("value");
  if (value == null || value === "") {
    // pick first non-empty if placeholder
    const firstReal = select.locator("option").nth(1);
    const v = await firstReal.getAttribute("value");
    if (v) await select.selectOption(v);
    else throw new Error(`No select option for ${String(label)}`);
  } else {
    await select.selectOption(value);
  }
}

/** Select first real (non-empty) option under a labeled <select>. */
export async function selectFirstOption(page: Page, label: RegExp | string) {
  const labelRe = typeof label === "string" ? new RegExp(label, "i") : label;
  const field = page.locator("label").filter({ hasText: labelRe }).first();
  const select = field.locator("select");
  await expect(select).toBeVisible({ timeout: 10000 });
  const options = select.locator("option");
  const count = await options.count();
  for (let i = 0; i < count; i++) {
    const v = await options.nth(i).getAttribute("value");
    if (v) {
      await select.selectOption(v);
      return;
    }
  }
  throw new Error(`No selectable option for ${String(label)}`);
}

/** Fill textarea/input under a labeled field (Notes, etc.). */
export async function fillTextByLabel(page: Page, label: RegExp | string, text: string) {
  const labelRe = typeof label === "string" ? new RegExp(label, "i") : label;
  const field = page.locator("label").filter({ hasText: labelRe }).first();
  await expect(field).toBeVisible({ timeout: 15000 });
  const control = field.locator("textarea, input:not([type=date]):not([type=hidden])").first();
  await control.fill(text);
}

/**
 * Add a document line and pick an item via Item Search modal (dblclick item code).
 */
export async function addItemLine(page: Page, itemQuery: string) {
  const addBtn = page.getByRole("button", { name: /\+?\s*Line/i }).first();
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
  }
  const itemCode = page.locator('input[title*="search items" i], input[readonly][class*="cursor-pointer"]').first();
  await expect(itemCode).toBeVisible({ timeout: 10000 });
  await itemCode.dblclick();

  const searchDialog = page.getByRole("heading", { name: /Search Item|Item Search|Search items|Items/i }).first();
  // ItemSearchModal may not use role=dialog — fall back to fixed overlay with search.
  const searchBox = page.getByPlaceholder(/search|item|code/i).last();
  try {
    await expect(searchBox.or(searchDialog)).toBeVisible({ timeout: 10000 });
  } catch {
    throw new Error("Item search UI did not open after dblclick");
  }
  if (await searchBox.isVisible().catch(() => false)) {
    await searchBox.fill(itemQuery);
  }
  const selectBtn = page.getByRole("button", { name: /^Select$/i }).first();
  await expect(selectBtn).toBeVisible({ timeout: 15000 });
  await selectBtn.click();
}

export async function openFirstDataRow(page: Page) {
  const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
  await expect(rows.first()).toBeVisible({ timeout: 20000 });
  await rows.first().dblclick();
}

export async function expectModalHeading(page: Page, heading: RegExp) {
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20000 });
}

export type SoftSkipInfo = { skip: (cond?: boolean, desc?: string) => void };

/** Try an async step; soft-skip the test on failure instead of failing hard. */
export async function tryOrSkip(testInfo: SoftSkipInfo, reason: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    softSkip(testInfo, `${reason}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function uniqueToken(prefix = "E2E") {
  return `${prefix}-${Date.now()}`;
}

/** Progress status may be a select or custom menu button. */
export async function setProgressStatus(page: Page) {
  const field = page.locator("label").filter({ hasText: /Progress status/i }).first();
  if (!(await field.isVisible().catch(() => false))) return;
  const select = field.locator("select");
  if (await select.isVisible().catch(() => false)) {
    await selectFirstOption(page, /Progress status/i);
    return;
  }
  const btn = field.getByRole("button").first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    const opt = page.getByRole("menuitem").or(page.locator('[role="option"], button').filter({ hasText: /Unconfirmed|Draft|Open|New/i })).first();
    if (await opt.isVisible().catch(() => false)) await opt.click();
  }
}

export async function listHasTable(page: Page): Promise<boolean> {
  return page.getByRole("table").first().isVisible().catch(() => false);
}

export type LocatorLike = Locator;
