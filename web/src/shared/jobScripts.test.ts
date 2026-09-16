/**
 * Contracts for the two jobs the product exists to do.
 *
 * These run without a browser and without auth, so a broken chain is caught on
 * every pull request rather than on the next live run. The E2E counterpart
 * (e2e/job-scripts.spec.ts) then checks that what is declared here is what a
 * user actually sees.
 */
import { describe, expect, it } from "vitest";
import { JOB_SCRIPTS, findJargon } from "./jobScripts";
import { resolveListChainGuide } from "./listChainGuides";
import { resolveListEmptyState } from "./listEmptyStates";

const allSteps = JOB_SCRIPTS.flatMap((job) => job.steps.map((step) => ({ job, step })));

describe("job scripts", () => {
  it("covers both directions money moves", () => {
    expect(JOB_SCRIPTS.map((j) => j.id).sort()).toEqual(["quote-to-cash", "request-to-pay"]);
  });

  it("chains every step to a real following step", () => {
    for (const job of JOB_SCRIPTS) {
      const ids = new Set(job.steps.map((s) => s.id));
      for (const step of job.steps) {
        if (step.nextStepId) expect(ids, `${job.id}/${step.id}`).toContain(step.nextStepId);
      }
      // Exactly one terminal step, otherwise the chain forks or never ends.
      expect(job.steps.filter((s) => !s.nextStepId)).toHaveLength(1);
      expect(job.steps.at(-1)?.nextStepId).toBeUndefined();
    }
  });

  it.each(allSteps)("$job.id/$step.id states where the user is and what comes next", ({ step }) => {
    const guide = resolveListChainGuide(step.route);
    expect(guide, `No chain guide for ${step.route}`).toBeDefined();
    expect(guide!.title.length).toBeGreaterThan(10);
    expect(guide!.steps.length).toBeGreaterThanOrEqual(2);
  });

  it.each(allSteps)("$job.id/$step.id tells an empty screen what to do", ({ step }) => {
    const empty = resolveListEmptyState(step.route);
    expect(empty, `No empty state for ${step.route}`).toBeDefined();
    expect(empty!.nextStep).toMatch(/choose|start|record|pay|collect|add/i);
  });

  it.each(allSteps)("$job.id/$step.id explains itself without jargon", ({ step }) => {
    const guide = resolveListChainGuide(step.route)!;
    const empty = resolveListEmptyState(step.route)!;
    const copy = [guide.title, guide.summary, ...guide.steps, empty.headline, empty.nextStep].join(" ");
    expect(findJargon(copy)).toEqual([]);
  });
});

describe("jargon detection", () => {
  it("catches the things that have actually leaked into the UI", () => {
    expect(findJargon("Open ACCT-II to continue")[0]?.why).toBe("internal module codename");
    expect(findJargon("lines[0].unit_id is required")[0]?.why).toBe("raw database column name");
    expect(findJargon("Status: PARTIALLY_RECEIVED")[0]?.why).toBe("raw enum value");
  });

  it("leaves ordinary business wording alone", () => {
    expect(findJargon("Choose New Sales to bill the customer and release the stock.")).toEqual([]);
    expect(findJargon("No quotations yet. Choose New to price up work for a customer.")).toEqual([]);
  });
});
