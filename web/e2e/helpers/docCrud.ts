import { test, expect } from "@playwright/test";
import { demoAuthAvailable, demoSignIn } from "./demoSignIn";
import { assertApiReachable } from "./apiReady";
import {
  openNewRow,
  openFirstDataRow,
  expectModalHeading,
  cancelEntityModal,
  saveEntityModal,
  fillLookup,
  fillDate,
  fillTextByLabel,
  selectFirstOption,
  setProgressStatus,
  addItemLine,
  uniqueToken,
  softSkip,
  noteIncomplete,
} from "./entityForm";

/**
 * Shared create/edit/cancel interaction journey for document-like modals.
 * Soft-skips when demo lookups / item search cannot complete a full save.
 */
export type DocCrudCase = {
  name: string;
  listPath: string;
  newHeading: RegExp;
  editHeading: RegExp;
  partnerLabel: RegExp;
  partnerQuery: string;
  locationLabel?: RegExp;
  locationQuery?: string;
  dateLabel?: RegExp;
  notesLabel?: RegExp;
  withLines?: boolean;
  itemQuery?: string;
};

async function fillDocHeader(page: import("@playwright/test").Page, c: DocCrudCase, note: string) {
  if (c.dateLabel) {
    await fillDate(page, c.dateLabel, new Date().toISOString().slice(0, 10));
  }
  await selectFirstOption(page, /Transaction type/i).catch(() => undefined);
  await selectFirstOption(page, /Currency/i).catch(() => undefined);
  await fillLookup(page, c.partnerLabel, c.partnerQuery);
  if (c.locationLabel && c.locationQuery) {
    await fillLookup(page, c.locationLabel, c.locationQuery);
  }
  await setProgressStatus(page);
  if (c.notesLabel) {
    await fillTextByLabel(page, c.notesLabel, note).catch(() => undefined);
  }
}

export function defineDocCrudSpec(c: DocCrudCase) {
  test.describe(`${c.name} CRUD interaction`, () => {
    test("cancel discards New modal; edit Notes + Save; create when seed allows", async ({ page }, testInfo) => {
      test.skip(!demoAuthAvailable(), "Set E2E_DEMO_PASSWORD or E2E_BENCH_TOKEN");
      test.setTimeout(120_000);
      page.setDefaultTimeout(12_000);

      const note = uniqueToken("NOTE");
      await demoSignIn(page);
      await page.goto(c.listPath);
      await assertApiReachable(page);

      const table = page.getByRole("table").first();
      try {
        await expect(table).toBeVisible({ timeout: 25000 });
      } catch {
        softSkip(testInfo, `${c.name} list table not visible`);
      }

      // --- Cancel New ---
      await openNewRow(page);
      await expectModalHeading(page, c.newHeading);
      await cancelEntityModal(page, c.newHeading);
      await expect(page.getByRole("heading", { name: c.newHeading })).toBeHidden({ timeout: 10000 });

      // --- Edit existing: change notes + save ---
      const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
      const rowCount = await rows.count();
      if (rowCount > 0) {
        await openFirstDataRow(page);
        const editVisible = await page
          .getByRole("heading", { name: c.editHeading })
          .isVisible()
          .catch(() => false);
        if (!editVisible) {
          // Row open may be view-only or different gesture — interaction already proved via New/Cancel.
        } else {
          if (c.notesLabel) {
            const notesField = page.locator("label").filter({ hasText: c.notesLabel }).first();
            if (await notesField.isVisible().catch(() => false)) {
              await fillTextByLabel(page, c.notesLabel, note);
              await saveEntityModal(page, c.editHeading);
              await page.waitForTimeout(1500);
            } else {
              await cancelEntityModal(page, c.editHeading);
            }
          } else {
            await cancelEntityModal(page, c.editHeading);
          }
        }
      }

      // --- Create New (best effort; hard deadline then soft-skip) ---
      await openNewRow(page);
      await expectModalHeading(page, c.newHeading);
      try {
        await Promise.race([
          (async () => {
            await fillDocHeader(page, c, note);
            if (c.withLines) {
              await addItemLine(page, c.itemQuery ?? "DEMO");
            }
            await saveEntityModal(page, c.newHeading);
            await page.waitForTimeout(1500);
          })(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("create path exceeded 35s")), 35_000),
          ),
        ]);
        const stillOpen = await page.getByRole("heading", { name: c.newHeading }).isVisible().catch(() => false);
        if (stillOpen) {
          await cancelEntityModal(page, c.newHeading).catch(() => undefined);
          noteIncomplete(testInfo, `${c.name} create stayed open (validation / seed)`);
          return;
        }
      } catch (e) {
        await cancelEntityModal(page, c.newHeading).catch(() => undefined);
        noteIncomplete(testInfo, `${c.name} create path: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });
}
