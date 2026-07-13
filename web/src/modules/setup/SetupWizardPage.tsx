import { A, useLocation, useNavigate } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { useSetupReadiness } from "../../shared/usePlatform";

const STEP_COPY: Record<string, { title: string; why: string; action: string; link?: string; ackStep?: string }> = {
  company: {
    title: "Your business",
    why: "Your company name appears on invoices, receipts, and reports. Update branding, then confirm.",
    action: "Open branding settings",
    link: "/app/settings/branding",
    ackStep: "company",
  },
  chart_of_accounts: {
    title: "Chart of accounts",
    why: "Your chart starts empty. Add at least one asset, liability, income, and expense account (or import the SME starter template), then continue.",
    action: "Set up accounts",
    link: "/app/finance/acct-i/chart-of-accounts",
    ackStep: "chart_of_accounts",
  },
  currency_tax: {
    title: "Currency & taxes",
    why: "We seeded PHP and standard VAT types. Open the list, adjust if needed, then confirm.",
    action: "Review tax types",
    link: "/app/quotation/tax-mngt/tax-types",
    ackStep: "currency_tax",
  },
  process_policies: {
    title: "Process policies",
    why: "Control whether quotations, sales orders, goods receipts, and reservations are required before the next document.",
    action: "Review process policies",
    link: "/app/user-management/process-policies",
    ackStep: "process_policies",
  },
  location: {
    title: "Stock location",
    why: "A default Main location was created. Confirm it or add branches before moving stock.",
    action: "Review locations",
    link: "/app/inventory/locations",
    ackStep: "location",
  },
  partners: {
    title: "Customers & suppliers",
    why: "Add at least one partner before creating quotes or purchase requests.",
    action: "Add a partner",
    link: "/app/inventory/partners",
  },
  items: {
    title: "Products",
    why: "Add your first product. Enable Track serial if you will scan serial numbers later.",
    action: "Add a product",
    link: "/app/inventory/items",
  },
  team: {
    title: "Invite your team",
    why: "Optional — invite colleagues when you are ready.",
    action: "Manage users",
    link: "/app/user-management/users",
  },
  ready: {
    title: "You are ready",
    why: "Foundation setup is complete. Choose how to start.",
    action: "Open dashboard",
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
  const steps = () => readiness.data?.steps.filter((s) => s.id !== "ready") ?? [];
  const currentStep = () => steps().find((s) => s.id === currentId());

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["setup-readiness"] });
    void qc.invalidateQueries({ queryKey: ["onboarding"] });
  };

  const ackCOA = async () => {
    setAcking(true);
    try {
      await apiFetch("/api/v1/platform/setup-readiness/ack-coa", { method: "POST" });
      refresh();
    } finally {
      setAcking(false);
    }
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

  const goNext = () => {
    refresh();
    const data = readiness.data;
    if (!data) return;
    const idx = data.steps.findIndex((s) => s.id === currentId());
    const next = data.steps[idx + 1];
    if (next) {
      navigate(next.href);
    } else if (data.required_complete) {
      navigate("/app/setup/ready");
    }
  };

  const skipWizard = async () => {
    await apiFetch("/api/v1/platform/setup-readiness/skip", { method: "POST" }, { silent: true });
    refresh();
    navigate("/app/dashboard");
  };

  return (
    <div class="mx-auto max-w-2xl p-6">
      <div class="mb-6">
        <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Workspace setup</p>
        <h1 class="mt-1 text-xl font-semibold text-text-primary">{copy().title}</h1>
        <p class="mt-2 text-sm text-text-secondary">{copy().why}</p>
      </div>

      <div class="mb-6 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          class="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${readiness.data?.percent ?? 0}%` }}
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
          <Show when={currentId() === "chart_of_accounts"}>
            <button
              type="button"
              disabled={acking()}
              class="mt-4 block text-sm text-brand-600 hover:underline disabled:opacity-50"
              onClick={() => void ackCOA()}
            >
              Looks good — continue
            </button>
          </Show>
          <Show when={copy().ackStep && currentId() !== "chart_of_accounts"}>
            <button
              type="button"
              disabled={acking() || currentStep()?.done}
              class="mt-4 block text-sm text-brand-600 hover:underline disabled:opacity-50"
              onClick={() => void ackStep(copy().ackStep!)}
            >
              {currentStep()?.done ? "Confirmed" : "Confirm — continue"}
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
          <h2 class="text-lg font-semibold text-emerald-900">Foundation complete</h2>
          <p class="mt-2 text-sm text-emerald-800">
            You can start selling, buying, or retail POS. Open the full onboarding playbook for every module —
            quotation through accounts, serial scanning, POS shifts, CRM, and more.
          </p>
          <div class="mt-4 flex flex-wrap gap-3">
            <A
              href="/app/onboarding"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Open onboarding playbook
            </A>
            <A
              href="/app/quotation/quotations/new"
              class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Create quotation
            </A>
            <A
              href="/app/pos/manage"
              class="rounded-lg border border-stroke bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Configure POS
            </A>
            <A href="/app/dashboard" class="text-sm text-brand-700 hover:underline">
              Open dashboard
            </A>
          </div>
        </div>
      </Show>
    </div>
  );
}
