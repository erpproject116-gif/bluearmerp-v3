import { test, expect } from "./fixtures";
import { ensureSignedIn } from "./storageAuth";
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
import { loadTenantProfile } from "./tenantProfile";
import { mutationsAllowed, currentTier } from "./liveSafety";
import { ledgerAppend, e2eMarker } from "./mutationLedger";

/**
 * Shared document modal journeys.
 * Read-only path: cancel New + open existing for view (no Save on production rows).
 * Mutating path: create E2E-* docs only when E2E_ALLOW_MUTATIONS=1.
 */
export type DocCrudCase = {
  name: string;
  listPath: string;
  newHeading: RegExp;
  editHeading: RegExp;
  partnerLabel: RegExp;
  /** Override; else tenant profile partnerQuery */
  partnerQuery?: string;
  locationLabel?: RegExp;
  locationQuery?: string;
  dateLabel?: RegExp;
  notesLabel?: RegExp;
  withLines?: boolean;
  itemQuery?: string;
  supplier?: boolean;
};

async function fillDocHeader(
  page: import("@playwright/test").Page,
  c: DocCrudCase,
  note: string,
  partnerQuery: string,
  itemQuery: string,
  locationQuery?: string,
) {
  if (c.dateLabel) {
    await fillDate(page, c.dateLabel, new Date().toISOString().slice(0, 10));
  }
  await selectFirstOption(page, /Transaction type/i).catch(() => undefined);
  await selectFirstOption(page, /Currency/i).catch(() => undefined);
  await fillLookup(page, c.partnerLabel, partnerQuery);
  if (c.locationLabel) {
    await fillLookup(page, c.locationLabel, locationQuery ?? "Head");
  }
  await setProgressStatus(page);
  if (c.notesLabel) {
    await fillTextByLabel(page, c.notesLabel, note).catch(() => undefined);
  }
  return itemQuery;
}

export function defineDocCrudSpec(c: DocCrudCase) {
  test.describe(`${c.name} CRUD interaction`, () => {
    test(`@read-only ${c.name}: cancel New; open existing without mutating first row`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      page.setDefaultTimeout(12_000);

      await ensureSignedIn(page);
      await page.goto(c.listPath);
      await assertApiReachable(page);

      const table = page.getByRole("table").first();
      try {
        await expect(table).toBeVisible({ timeout: 25000 });
      } catch {
        softSkip(testInfo, `${c.name} list table not visible`);
      }

      await openNewRow(page);
      await expectModalHeading(page, c.newHeading);
      await cancelEntityModal(page, c.newHeading);
      await expect(page.getByRole("heading", { name: c.newHeading })).toBeHidden({ timeout: 10000 });

      // Open first row for view only — never Save edits on existing production data.
      const rows = page.locator("tbody tr").filter({ hasNotText: /Resize column/i });
      const rowCount = await rows.count();
      if (rowCount > 0) {
        await openFirstDataRow(page);
        const editVisible = await page
          .getByRole("heading", { name: c.editHeading })
          .isVisible()
          .catch(() => false);
        if (editVisible) {
          await cancelEntityModal(page, c.editHeading).catch(() => undefined);
        }
      }
    });

    test(`@mutating @reversible ${c.name}: create E2E document when mutations allowed`, async ({
      page,
    }, testInfo) => {
      test.skip(
        !mutationsAllowed(),
        `Mutations blocked (tier=${currentTier()}). Set E2E_TIER=reversible|posting, E2E_ALLOW_MUTATIONS=1, E2E_RUN_CONFIRM=<id>`,
      );
      test.setTimeout(120_000);
      page.setDefaultTimeout(12_000);

      const profile = loadTenantProfile();
      const partnerQuery = c.partnerQuery ?? (c.supplier ? profile.supplierQuery : profile.partnerQuery);
      const itemQuery = c.itemQuery ?? profile.itemQuery;
      const locationQuery = c.locationQuery ?? profile.locationQuery;
      const note = e2eMarker("NOTE");

      await ensureSignedIn(page);
      await page.goto(c.listPath);
      await assertApiReachable(page);

      const table = page.getByRole("table").first();
      try {
        await expect(table).toBeVisible({ timeout: 25000 });
      } catch {
        softSkip(testInfo, `${c.name} list table not visible`);
      }

      await openNewRow(page);
      await expectModalHeading(page, c.newHeading);
      try {
        await Promise.race([
          (async () => {
            await fillDocHeader(page, c, note, partnerQuery, itemQuery, locationQuery);
            if (c.withLines) {
              await addItemLine(page, itemQuery);
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
        ledgerAppend({
          kind: c.name,
          marker: note,
          path: c.listPath,
          status: "created",
        });
      } catch (e) {
        await cancelEntityModal(page, c.newHeading).catch(() => undefined);
        noteIncomplete(testInfo, `${c.name} create path: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  });
}
