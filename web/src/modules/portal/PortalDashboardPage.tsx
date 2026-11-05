import { createResource, createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { LoadingText } from "../../shared/LoadingText";
import { formatMoney } from "../../shared/money";
import {
  clearPortalToken,
  fetchPortalSession,
  getPortalToken,
  portalFetch,
} from "../../shared/portal-api";
import { PortalHrTab } from "./PortalHrTab";
import "../hr/hr-surface.css";
import { HrBadge } from "../hr/HrUi";

type PortalOrder = {
  id: number;
  order_date: string;
  order_no: string;
  status: string;
  grand_total: number;
};

type PortalInvoice = {
  id: number;
  order_date: string;
  sales_no: string;
  status: string;
  grand_total: number;
};

type PortalTicket = {
  id: number;
  ticket_no: string;
  subject: string;
  status: string;
  priority: string;
};

type PortalSite = { site_name: string; client_name: string };

const tabs = ["summary", "sites", "time", "leave", "requests", "incidents", "evaluations", "bills", "documents", "users", "notices", "activity", "orders", "invoices", "tickets"] as const;
type Tab = (typeof tabs)[number];
const classic = new Set<Tab>(["orders", "invoices", "tickets", "sites"]);
const labels: Record<Tab, string> = {
  summary: "Dashboard", sites: "Sites", time: "Time files", leave: "Leave",
  requests: "Manpower", incidents: "Incidents", evaluations: "Evaluations",
  bills: "Bills", documents: "Documents", users: "Users", notices: "Notices",
  activity: "Activity", orders: "Orders", invoices: "Invoices", tickets: "Tickets",
};

export default function PortalDashboardPage() {
  const navigate = useNavigate();
  const [tab, setTab] = createSignal<Tab>("summary");
  const token = getPortalToken();

  const [session] = createResource(async () => {
    if (!token) return null;
    const res = await fetchPortalSession(token);
    if (!res.ok) return null;
    return res.data ?? null;
  });

  const [list] = createResource(
    () => ({ tab: tab(), ready: session.state === "ready" && !!session() }),
    async ({ tab: active, ready }) => {
      if (!ready || !token || !classic.has(active as Tab)) return { rows: [] as unknown[], total: 0 };
      const path =
        active === "orders"
          ? "/api/v1/portal/orders"
          : active === "invoices"
            ? "/api/v1/portal/invoices"
            : active === "sites"
              ? "/api/v1/portal/sites"
              : "/api/v1/portal/tickets";
      const res = await portalFetch<unknown[]>(`${path}?pageSize=50&order=desc`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load data.");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
  );

  const signOut = () => {
    clearPortalToken();
    navigate("/portal/login", { replace: true });
  };

  return (
    <Show
      when={token}
      fallback={
        <div class="flex min-h-screen items-center justify-center">
          <a href="/portal/login" class="text-brand-600 hover:underline">
            Sign in to the portal
          </a>
        </div>
      }
    >
      <div class="min-h-screen bg-surface">
        <header class="border-b border-stroke bg-white px-6 py-4">
          <div class="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-lg font-semibold text-text-primary">Client portal</h1>
                <HrBadge tone="brand">Client</HrBadge>
              </div>
              <Show when={session()}>
                <p class="text-sm text-text-secondary">
                  {session()!.display_name || session()!.email}
                  {session()!.partner_name ? ` · ${session()!.partner_name}` : ""}
                </p>
              </Show>
            </div>
            <button
              type="button"
              class="text-sm text-text-secondary hover:text-text-primary"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <main class="mx-auto flex min-w-0 max-w-6xl flex-col gap-4 px-4 py-4 md:flex-row md:px-6">
          <Show when={session.state === "ready" && !session()}>
            <p class="text-sm text-red-600">
              Your link has expired.{" "}
              <a href="/portal/login" class="text-brand-600 hover:underline">
                Request a new one
              </a>
            </p>
          </Show>

          <nav class="flex max-w-full gap-1 overflow-x-auto md:w-48 md:shrink-0 md:flex-col" aria-label="Client portal">
            <For each={tabs}>
              {(t) => (
                <button
                  type="button"
                  class={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium md:w-full ${
                    tab() === t
                      ? "bg-brand-600 text-white"
                      : "border border-stroke bg-white text-text-primary hover:bg-surface"
                  }`}
                  onClick={() => setTab(t)}
                >
                  {labels[t]}
                </button>
              )}
            </For>
          </nav>
          <div class="min-w-0 flex-1">
          <Show when={!classic.has(tab())}>
            <PortalHrTab tab={tab()} />
          </Show>

          <Show when={classic.has(tab()) && list.loading}>
            <LoadingText class="text-sm text-text-secondary" as="p" />
          </Show>

          <Show when={classic.has(tab()) && list.error}>
            <p class="text-sm text-red-600">{(list.error as Error).message}</p>
          </Show>

          <Show when={classic.has(tab()) && !list.loading && !list.error && tab() === "orders"}>
            <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
              <table class="min-w-full text-sm">
                <thead class="bg-surface text-left text-text-secondary">
                  <tr>
                    <th class="px-4 py-3">Order #</th>
                    <th class="px-4 py-3">Date</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(list()?.rows ?? []) as PortalOrder[]}>
                    {(row) => (
                      <tr class="border-t border-stroke/60">
                        <td class="px-4 py-3 font-medium">{row.order_no}</td>
                        <td class="px-4 py-3">{row.order_date}</td>
                        <td class="px-4 py-3 capitalize">{row.status.replace(/_/g, " ")}</td>
                        <td class="px-4 py-3 text-right">{formatMoney(row.grand_total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={classic.has(tab()) && !list.loading && !list.error && tab() === "invoices"}>
            <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
              <table class="min-w-full text-sm">
                <thead class="bg-surface text-left text-text-secondary">
                  <tr>
                    <th class="px-4 py-3">Invoice #</th>
                    <th class="px-4 py-3">Date</th>
                    <th class="px-4 py-3">Status</th>
                    <th class="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(list()?.rows ?? []) as PortalInvoice[]}>
                    {(row) => (
                      <tr class="border-t border-stroke/60">
                        <td class="px-4 py-3 font-medium">{row.sales_no}</td>
                        <td class="px-4 py-3">{row.order_date}</td>
                        <td class="px-4 py-3 capitalize">{row.status}</td>
                        <td class="px-4 py-3 text-right">{formatMoney(row.grand_total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={classic.has(tab()) && !list.loading && !list.error && tab() === "sites"}>
            <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
              <table class="min-w-full text-sm">
                <thead class="bg-surface text-left text-text-secondary">
                  <tr>
                    <th class="px-4 py-3">Client</th>
                    <th class="px-4 py-3">Site</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(list()?.rows ?? []) as PortalSite[]}>
                    {(row) => (
                      <tr class="border-t border-stroke/60">
                        <td class="px-4 py-3 font-medium">{row.client_name}</td>
                        <td class="px-4 py-3">{row.site_name}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>

          <Show when={classic.has(tab()) && !list.loading && !list.error && tab() === "tickets"}>
            <div class="overflow-x-auto rounded-xl border border-stroke bg-white">
              <table class="min-w-full text-sm">
                <thead class="bg-surface text-left text-text-secondary">
                  <tr>
                    <th class="px-4 py-3">Ticket #</th>
                    <th class="px-4 py-3">Subject</th>
                    <th class="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(list()?.rows ?? []) as PortalTicket[]}>
                    {(row) => (
                      <tr class="border-t border-stroke/60">
                        <td class="px-4 py-3 font-medium">{row.ticket_no}</td>
                        <td class="px-4 py-3">{row.subject}</td>
                        <td class="px-4 py-3 capitalize">{row.status.replace(/_/g, " ")}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
          </div>
        </main>
      </div>
    </Show>
  );
}
