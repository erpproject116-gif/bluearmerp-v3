import { A, useParams } from "@solidjs/router";
import { Show } from "solid-js";
import { formatMoney } from "../../shared/money";
import { useCrmClientHealth } from "../../shared/useCrmClients";
import { CrmLayout } from "./CrmLayout";

export default function CrmClientDetailPage() {
  const params = useParams();
  const partnerId = () => {
    const n = Number(params.id);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const detail = useCrmClientHealth(partnerId);
  const row = () => detail.data;

  return (
    <CrmLayout>
      <Show when={detail.isError}>
        <p class="mb-3 text-sm text-red-600">{(detail.error as Error)?.message}</p>
      </Show>
      <Show when={row()}>
        {(r) => (
          <>
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <A href="/app/crm/clients" class="text-sm text-brand-600 hover:underline">← Clients</A>
                <h1 class="mt-1 text-xl font-semibold text-text-primary">{r().company_name}</h1>
                <p class="text-sm text-text-secondary">{r().partner_code}</p>
              </div>
              <A
                href={`/app/inventory/partners`}
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Edit in Partners
              </A>
            </div>

            <div class="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Health score" value={String(r().health_score)} />
              <Tile label="Open AR" value={formatMoney(r().open_ar_balance)} />
              <Tile
                label="Credit"
                value={
                  r().credit_limit != null
                    ? `${formatMoney(r().credit_limit!)}${r().credit_limit_on_hold ? " (on hold)" : ""}`
                    : r().credit_limit_on_hold
                      ? "On hold"
                      : "—"
                }
              />
              <Tile
                label="Last activity"
                value={r().last_activity_date ?? "—"}
                hint={r().days_since_activity != null ? `${r().days_since_activity} days ago` : undefined}
              />
            </div>

            <div class="grid gap-4 md:grid-cols-2">
              <section class="rounded-xl border border-stroke bg-white p-4">
                <h2 class="mb-2 text-sm font-semibold">Communications</h2>
                <p class="text-sm text-text-secondary">
                  Open follow-ups: {r().open_follow_ups}
                  {r().overdue_follow_ups > 0 ? ` (${r().overdue_follow_ups} overdue)` : ""}
                </p>
                <A href="/app/crm/follow-up-tasks" class="mt-2 inline-block text-sm text-brand-600 hover:underline">
                  View follow-up tasks
                </A>
              </section>
              <section class="rounded-xl border border-stroke bg-white p-4">
                <h2 class="mb-2 text-sm font-semibold">Deliverables</h2>
                <p class="text-sm text-text-secondary">
                  Open work items: {r().open_work_items}
                  {r().overdue_work_items > 0 ? ` (${r().overdue_work_items} overdue)` : ""}
                </p>
                <A href="/app/operations" class="mt-2 inline-block text-sm text-brand-600 hover:underline">
                  Open operations hub
                </A>
              </section>
            </div>
          </>
        )}
      </Show>
    </CrmLayout>
  );
}

function Tile(props: { label: string; value: string; hint?: string }) {
  return (
    <div class="rounded-xl border border-stroke bg-white p-4">
      <p class="text-xs text-text-secondary">{props.label}</p>
      <p class="mt-1 text-lg font-semibold text-text-primary">{props.value}</p>
      <Show when={props.hint}>
        <p class="text-xs text-text-secondary">{props.hint}</p>
      </Show>
    </div>
  );
}
