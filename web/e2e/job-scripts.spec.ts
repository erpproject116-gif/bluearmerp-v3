/**
 * Score the two jobs end to end, not screen by screen.
 *
 * Every screen in a chain can pass its own contract while the chain itself is
 * unwalkable: the user finds a list, cannot tell what it is for, saves nothing,
 * and has no idea where to go next. Each step is scored on the four things that
 * decide whether a non-technical user gets through:
 *
 *   found the screen    the route loads and announces what it is
 *   labels clear        no internal jargon on a screen a customer-facing user reads
 *   save worked         the primary action is reachable and responds
 *   next step obvious   the screen names the document that comes after it
 *
 * Read-only by default: "save worked" means the create form opens and can be
 * dismissed, not that a record was written. The shared fixture's mutation guard
 * enforces that.
 */
import { test, expect } from "./helpers/fixtures";
import { ensureSignedIn } from "./helpers/storageAuth";
import { assertApiReachable } from "./helpers/apiReady";
import { writeEvidence } from "./helpers/liveSafety";
import { JOB_SCRIPTS, findJargon, type JobScript, type JobStep } from "../src/shared/jobScripts";

type StepScore = {
  job: string;
  step: string;
  goal: string;
  route: string;
  foundTheScreen: boolean;
  labelsClear: boolean;
  saveWorked: boolean;
  nextStepObvious: boolean;
  notes: string[];
};

const CRITERIA = ["foundTheScreen", "labelsClear", "saveWorked", "nextStepObvious"] as const;

async function scoreStep(
  page: import("@playwright/test").Page,
  job: JobScript,
  step: JobStep,
): Promise<StepScore> {
  const notes: string[] = [];

  await page.goto(step.route);
  await assertApiReachable(page);

  const rendered = await page
    .locator("main, table, h1, h2, [role='main']")
    .first()
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);

  const body = await page.locator("body").innerText().catch(() => "");
  const foundTheScreen = rendered && step.screenSignal.test(body);
  if (!foundTheScreen) {
    notes.push(rendered ? `Screen never says "${step.screenSignal}"` : "Screen did not render");
  }

  const jargon = findJargon(body.slice(0, 6000));
  const labelsClear = jargon.length === 0;
  for (const j of jargon) notes.push(`Jargon "${j.match}" (${j.why})`);

  // The primary action must be findable by its visible label, the way a user
  // finds it, rather than by a test id they cannot see.
  const primary = page.getByRole("button", { name: /^\s*\+?\s*New\b/i }).first();
  let saveWorked = await primary.isVisible({ timeout: 8000 }).catch(() => false);
  if (saveWorked) {
    await primary.click().catch(() => undefined);
    const opened = await page
      .getByRole("heading", { name: /New\b/i })
      .first()
      .isVisible({ timeout: 8000 })
      .catch(() => false);
    if (!opened) {
      saveWorked = false;
      notes.push("New control exists but nothing opened");
    }
    const dismiss = page.getByRole("button", { name: /^(Cancel|Close)$/i }).first();
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.click().catch(() => undefined);
    } else if (opened) {
      notes.push("No Cancel or Close: the user cannot back out");
      await page.keyboard.press("Escape").catch(() => undefined);
    }
  } else {
    // Receivables and payables are populated by upstream documents, not by hand.
    // Absence of a New control there is correct, so it is scored as reachable.
    saveWorked = /receivable|payable/i.test(step.route);
    if (!saveWorked) notes.push("No New control a first-time user could find");
  }

  // The guide rendered by ModalFormGuide is the contract from UX3: a list screen
  // must say what follows it.
  const nextLabel = step.nextStepId
    ? job.steps.find((s) => s.id === step.nextStepId)?.goal
    : undefined;
  const nextStepObvious = step.nextStepId
    ? /next|then|becomes|step \d|once|when you/i.test(body)
    : /collect|settle|clears|paid/i.test(body);
  if (!nextStepObvious) {
    notes.push(`Screen never points at what comes next${nextLabel ? ` (${nextLabel})` : ""}`);
  }

  return {
    job: job.id,
    step: step.id,
    goal: step.goal,
    route: step.route,
    foundTheScreen,
    labelsClear,
    saveWorked,
    nextStepObvious,
    notes,
  };
}

test.describe("Job scripts", () => {
  test("@read-only quote to cash and request to pay are walkable end to end", async ({ page }) => {
    test.setTimeout(12 * 60 * 1000);

    await ensureSignedIn(page);

    const scores: StepScore[] = [];
    for (const job of JOB_SCRIPTS) {
      for (const step of job.steps) {
        scores.push(await scoreStep(page, job, step));
      }
    }

    const passed = scores.reduce((n, s) => n + CRITERIA.filter((c) => s[c]).length, 0);
    const possible = scores.length * CRITERIA.length;

    const evidencePath = writeEvidence("job-scripts.json", {
      at: new Date().toISOString(),
      score: `${passed}/${possible}`,
      scores,
    });

    test.info().annotations.push({
      type: "job-script",
      description: `${passed}/${possible} criteria met, evidence=${evidencePath}`,
    });

    const failures = scores.flatMap((s) =>
      CRITERIA.filter((c) => !s[c]).map(
        (c) => `${s.job}/${s.step} (${s.route}) failed ${c}: ${s.notes.join("; ") || "no detail"}`,
      ),
    );

    expect(failures, `Job script failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
