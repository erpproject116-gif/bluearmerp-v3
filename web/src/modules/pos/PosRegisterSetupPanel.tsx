import { createQuery } from "@tanstack/solid-query";
import { A } from "@solidjs/router";
import { For, Show, createResource } from "solid-js";
import { apiFetch } from "../../shared/api";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { isTenantModuleEnabled } from "../../shared/moduleAccess";
import { usePosSettings } from "../../shared/usePos";
import { POS_CASHIER_SHELL_V2 } from "./posShellV2";
import { posSetupRequiredOpen, posSetupRows, type PosSetupRow } from "./posSetup";

type TaxType = { id: number; name: string; rate_percent: number };

type SetupWarnings = {
  count: number;
  items: { item_id: number; item_code: string; stop: "serial" | "lot" }[];
};

export function canSeePosRegisterSetup(me: Parameters<typeof hasPermission>[0]): boolean {
  return hasPermission(me, "pos.manage", "read") && isTenantModuleEnabled(me, "pos");
}

export default function PosRegisterSetupPanel(props: { home?: boolean }) {
  const auth = useAuth();
  const visible = () => canSeePosRegisterSetup(auth.me);
  const settings = usePosSettings();
  const [taxTypes] = createResource(
    () => visible() && (settings.data?.default_tax_type_id ?? 0) > 0,
    async () => {
      const res = await apiFetch<TaxType[]>(
        "/api/v1/quotation/tax-types?page=1&pageSize=100&status=active&sort=sort_order&order=asc",
      );
      return res.data ?? [];
    },
  );
  const warnings = createQuery(() => ({
    queryKey: ["pos-setup-warnings"],
    enabled: visible(),
    queryFn: async () => {
      const res = await apiFetch<SetupWarnings>("/api/v1/pos/setup-warnings");
      if (!res.success || !res.data) return { count: 0, items: [] };
      return res.data;
    },
  }));

  const taxLabel = () => {
    const id = settings.data?.default_tax_type_id;
    if (id == null || id <= 0) return "";
    const match = (taxTypes() ?? []).find((t) => t.id === id);
    if (match) return `${match.name} (${match.rate_percent}%)`;
    const rate = settings.data?.tax_rate_percent;
    return rate != null ? `${rate}%` : "";
  };

  const rows = (): PosSetupRow[] => {
    const data = settings.data;
    if (!data) return [];
    return posSetupRows(data, { shellScans: POS_CASHIER_SHELL_V2, taxLabel: taxLabel() });
  };

  const show = () => {
    if (!visible() || !settings.data) return false;
    if (props.home && !posSetupRequiredOpen(rows())) return false;
    return true;
  };

  const stopItems = () => warnings.data?.items ?? [];
  const stopCount = () => warnings.data?.count ?? stopItems().length;

  return (
    <Show when={show()}>
      <div class="rounded-xl border border-stroke bg-white p-5">
        <h3 class="text-sm font-semibold text-text-primary">POS register setup</h3>
        <p class="mt-1 text-sm text-text-secondary">Complete these items before the first sale.</p>
        <ul class="mt-4 space-y-3">
          <For each={rows()}>
            {(row) => (
              <li class="flex flex-wrap items-start justify-between gap-3 border-b border-stroke pb-3 last:border-0 last:pb-0">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2 text-sm">
                    <Show
                      when={row.set}
                      fallback={
                        <span class="inline-flex items-center gap-1.5 text-amber-800">
                          <span class="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                          Not set
                        </span>
                      }
                    >
                      <span class="inline-flex items-center gap-1.5 text-emerald-800">
                        <span class="text-emerald-600" aria-hidden="true">
                          ✓
                        </span>
                        Set
                      </span>
                    </Show>
                    <span class="font-medium text-text-primary">{row.name}</span>
                    <span class="text-text-secondary">{row.value}</span>
                  </div>
                  <Show when={row.sentence}>
                    <p class="mt-1 text-xs text-text-secondary">{row.sentence}</p>
                  </Show>
                </div>
                <Show when={row.focus}>
                  <A
                    href={`/app/pos/manage?tab=settings&focus=${row.focus}`}
                    class="shrink-0 rounded-lg border border-stroke px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
                  >
                    Open
                  </A>
                </Show>
              </li>
            )}
          </For>
          <Show when={stopCount() > 0}>
            <li class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2 text-sm">
                  <span class="inline-flex items-center gap-1.5 text-amber-800">
                    <span class="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden="true" />
                    Not set
                  </span>
                  <span class="font-medium text-text-primary">Serial or lot stop</span>
                  <span class="text-text-secondary">{stopCount()} items will stop the sale</span>
                </div>
                <p class="mt-1 text-xs text-text-secondary">
                  These items require a serial or a lot. The sale stops until the cashier picks one.
                </p>
                <p class="mt-1 text-xs text-text-primary">{stopItems().map((item) => item.item_code).join(", ")}</p>
              </div>
              <A
                href="/app/inventory/items"
                class="shrink-0 rounded-lg border border-stroke px-2.5 py-1 text-xs font-medium text-text-primary hover:bg-slate-50"
              >
                Open items
              </A>
            </li>
          </Show>
        </ul>
      </div>
    </Show>
  );
}
