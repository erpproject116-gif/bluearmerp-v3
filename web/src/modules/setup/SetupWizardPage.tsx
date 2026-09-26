import { A, useLocation, useNavigate } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useSetupReadiness } from "../../shared/usePlatform";
import {
  GETTING_STARTED_COPY,
  wizardFoundationPercent,
  wizardFoundationSteps,
} from "../../shared/setupProgress";
import { PageCoachMark } from "../../shared/PageCoachMark";

const STEP_COPY: Record<string, { title: string; why: string; action: string; link?: string; ackStep?: string }> = {
  company: {
    title: "Business name and logo",
    why: "Add the name people see on your papers. A logo is optional.",
    action: "Add your business name",
    link: "/app/settings/branding",
  },
  chart_of_accounts: {
    title: "List of money accounts",
    why: "These are the accounts your sales and bills use. If they are already here, this step is done.",
    action: "Look at the accounts",
    link: "/app/finance/acct-i/chart-of-accounts",
  },
  currency_tax: {
    title: "Peso and sales tax",
    why: "Set the peso, and the sales tax you charge. If they are already here, this step is done.",
    action: "Look at peso and sales tax",
    link: "/app/quotation/tax-mngt/tax-types",
  },
  process_policies: {
    title: "The order you use for selling and buying",
    why: "Look at the order your papers follow. When it looks right, continue.",
    action: "Look at the order",
    link: "/app/user-management/process-policies",
    ackStep: "process_policies",
  },
  location: {
    title: "Where you keep products",
    why: "This is the place your products sit. If a place is already here, this step is done.",
    action: "Look at the place",
    link: "/app/inventory/locations",
  },
  partners: {
    title: "A person or company you sell to or buy from",
    why: "Add at least one.",
    action: "Add someone",
    link: "/app/inventory/partners",
  },
  items: {
    title: "Something you sell",
    why: "Add at least one product.",
    action: "Add a product",
    link: "/app/inventory/items",
  },
  team: {
    title: "Invite your team",
    why: "Optional. You can do this later. You do not need a second person to finish.",
    action: "Invite someone",
    link: "/app/user-management/users",
  },
  ready: {
    title: "The workspace is ready",
    why: "The required steps are done. You can start using this workspace.",
    action: "Go to the home page",
    link: "/app/dashboard",
  },
};

function stepFromPath(path: string): string {
  const slug = path.replace(/^\/app\/setup\/?/, "").split("/")[0];
  const map: Record<string, string> = {
    company: "company",
    "chart-of-accounts": "chart_of_accounts",
    "currency-tax": "currency_tax",
    "process-policies": "process_policies",
    location: "location",
    partners: "partners",
    items: "items",
    team: "team",
    ready: "ready",
  };
  return map[slug] ?? "company";
}

export default function SetupWizardPage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const readiness = useSetupReadiness();
  const [acking, setAcking] = createSignal(false);

  const currentId = () => stepFromPath(loc.pathname);
  const copy = () => STEP_COPY[currentId()] ?? STEP_COPY.company;
  const steps = () =>
    wizardFoundationSteps(readiness.data).map((s) => ({
      ...s,
      label: GETTING_STARTED_COPY[s.id]?.label ?? s.label,
    }));
  const currentStep = () => steps().find((s) => s.id === currentId());

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["setup-readiness"] });
    void qc.invalidateQueries({ queryKey: ["onboarding"] });
  };

  const ackStep = async (stepId: string) => {
    setAcking(true);
    try {
      await apiFetch("/api/v1/platform/setup-readiness/ack-step", {
        method: "POST",
        body: JSON.stringify({ step_id: stepId }),
      });
      refresh();
    } finally {
      setAcking(false);
    }
  };

  const advance = () => {
    const data = readiness.data;
    if (!data) return;
    const wizard = [...wizardFoundationSteps(data), ...(data.steps ?? []).filter((s) => s.id === "ready")];
    const idx = wizard.findIndex((s) => s.id === currentId());
    const next = wizard[idx + 1];
    if (next) {
      navigate(next.href);
    } else if (data.required_complete) {
      navigate("/app/setup/ready");
    }
  };

  const goNext = () => {
    if (currentId() === "process_policies" && !currentStep()?.done) {
      void ackStep("process_policies").then(() => advance());
      return;
    }
    refresh();
    advance();
  };

  const skipWizard = async () => {
    await apiFetch("/api/v1/platform/setup-readiness/skip", { method: "POST" }, { silent: true });
    refresh();
    navigate("/app/dashboard");
  };

  return (
    <div class="mx-auto max-w-2xl p-6">
      <PageCoachMark
        storageKey="bluearm:coach:setup-wizard"
        message="Finish the steps with a dot still open. When the bar is full, this workspace is ready. Inviting someone is optional."
      />
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Workspace setup</p>
        <h1 class="mt-1 text-xl font-semibold text-text-primary">{copy().title}</h1>
        <p class="mt-2 text-sm text-text-secondary">{copy().why}</p>
      </div>

      <div class="mb-6 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${wizardFoundationPercent(readiness.data)}%` }}
        />
      </div>

      <ul class="mb-8 space-y-1 text-sm">
        <For each={steps()}>
          {(step) => (
            <li class="flex items-center gap-2">
              <span
                class={`h-2 w-2 rounded-full ${step.done ? "bg-emerald-500" : step.id === currentId() ? "bg-brand-600" : "bg-slate-300"}`}
              />
              <A
                href={step.href}
                classList={{
                  "font-medium text-brand-700": step.id === currentId(),
                  "text-text-secondary line-through": step.done,
                  "text-text-primary": !step.done && step.id !== currentId(),
                }}
              >
                {step.label}
                <Show when={!step.required}>
                  <span class="ml-1 text-text-secondary">(optional)</span>
                </Show>
              </A>
            </li>
          )}
        </For>
      </ul>

      <Show when={currentId() !== "ready"}>
        <div class="rounded-xl border border-stroke bg-white p-6 shadow-sm">
          <Show when={currentStep()?.done}>
            <p class="text-sm text-emerald-700">This step looks complete.</p>
          </Show>
          <Show when={!currentStep()?.done && copy().link}>
            <A
              href={copy().link!}
              class="inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              {copy().action}
            </A>
          </Show>
          <Show when={copy().ackStep}>
            <button
              type="button"
              disabled={acking()}
              class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              onClick={goNext}
            >
              This looks right
            </button>
          </Show>
          <button
            type="button"
            class="mt-6 rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
            onClick={goNext}
          >
            Continue
          </button>
          <button
            type="button"
            class="mt-3 block text-sm text-text-secondary hover:text-brand-600 hover:underline"
            onClick={() => void skipWizard()}
          >
            Skip for now — remind me in the header
          </button>
        </div>
      </Show>

      <Show when={currentId() === "ready" || readiness.data?.required_complete}>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <h2 class="text-lg font-semibold text-emerald-900">The workspace is ready</h2>
          <p class="mt-2 text-sm text-emerald-800">The required steps are done. You can start using this workspace.</p>
          <div class="mt-4 flex flex-wrap gap-3">
            <A href="/app/dashboard" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Go to the home page
            </A>
          </div>
        </div>
      </Show>
    </div>
  );
}
