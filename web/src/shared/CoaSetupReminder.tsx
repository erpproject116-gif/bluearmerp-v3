import { A } from "@solidjs/router";
import { Show } from "solid-js";
import { useSetupReadiness } from "./usePlatform";

/** Persistent reminder that COA configuration matters — does not block saving sales documents. */
export function CoaSetupReminder(props: { class?: string }) {
  const q = useSetupReadiness();
  const needsCoa = () => {
    const steps = q.data?.steps ?? [];
    const coa = steps.find((s) => s.id === "chart_of_accounts");
    return Boolean(coa && !coa.done);
  };

  return (
    <Show when={needsCoa()}>
      <div
        class={`mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 ${props.class ?? ""}`}
        role="status"
      >
        <p class="font-medium">Configure your chart of accounts</p>
        <p class="mt-0.5 text-xs text-sky-900/80">
          You can save this sales document now. Set up all four account types (asset, liability, income, expense) and map
          Purchases / COGS so posting, VAT, and purchase costs work correctly.
        </p>
        <A
          href="/app/finance/acct-i/chart-of-accounts?focus=purchase#default-account-mappings"
          class="mt-2 inline-block text-xs font-medium text-sky-800 underline hover:text-sky-950"
        >
          Open Chart of Accounts → Purchases / COGS mapping
        </A>
      </div>
    </Show>
  );
}
