import { useLocation } from "@solidjs/router";
import { createMemo, createResource, For, Show } from "solid-js";
import { LoadingText } from "../../shared/LoadingText";
import { formatMoney } from "../../shared/money";
import { portalFetch } from "../../shared/portal-api";
import { HrEmpty, HrNotice, HrPlanned, HrTcard } from "../hr/HrUi";
import { PortalHrTab } from "./PortalHrTab";
import { PortalLayout, PORTAL_BASE } from "./PortalLayout";

type PortalOrder = { id: number; order_date: string; order_no: string; status: string; grand_total: number };
type PortalInvoice = { id: number; order_date: string; sales_no: string; status: string; grand_total: number };
type PortalTicket = { id: number; ticket_no: string; subject: string; status: string };

function segment(): string {
  const loc = useLocation();
  const p = loc.pathname.replace(/\/+$/, "");
  if (p === PORTAL_BASE) return "";
  const rest = p.slice(PORTAL_BASE.length).replace(/^\//, "");
  return rest.split("/")[0] ?? "";
}

const HR_TABS: Record<string, string> = {
  "": "summary",
  employees: "summary", // people list via dedicated below
  dtr: "time",
  approvals: "leave",
  "manpower-requests": "requests",
  evaluations: "evaluations",
  incidents: "incidents",
  billing: "bills",
  documents: "documents",
  users: "users",
  notices: "notices",
  activity: "activity",
};

const TITLES: Record<string, { title: string; subtitle?: string }> = {
  "": { title: "Dashboard", subtitle: "Workforce and account summary for your branches." },
  employees: { title: "Deployed employees", subtitle: "People assigned to your sites." },
  dtr: { title: "DTR submissions", subtitle: "Submit time files per cut-off. Lock/return/versioning Planned." },
  approvals: { title: "Leave approvals", subtitle: "Accept or refuse worker leave requests." },
  "manpower-requests": { title: "Manpower requests", subtitle: "Request headcount for your sites." },
  evaluations: { title: "Evaluations" },
  incidents: { title: "Incidents", subtitle: "Report workplace incidents for agency HR." },
  billing: { title: "Billing", subtitle: "Accepted time bills — not employee pay." },
  documents: { title: "Documents" },
  users: { title: "Users", subtitle: "Portal users for your client account." },
  orders: { title: "Orders" },
  invoices: { title: "Invoices" },
  tickets: { title: "Tickets" },
  reports: { title: "Reports", subtitle: "Client portal reports." },
  notifications: { title: "Notifications" },
  help: { title: "Help" },
  profile: { title: "Profile" },
  "audit-log": { title: "Audit log" },
};

export default function ClientPortalApp() {
  const seg = createMemo(() => segment());
  const meta = createMemo(() => TITLES[seg()] ?? { title: "Client portal" });
  const planned = createMemo(() =>
    ["reports", "notifications", "help", "profile", "audit-log"].includes(seg()),
  );
  const classic = createMemo(() => ["orders", "invoices", "tickets"].includes(seg()));
  const hrTab = createMemo(() => HR_TABS[seg()]);

  const [people] = createResource(
    () => seg() === "employees",
    async (on) => {
      if (!on) return [];
      const res = await portalFetch<{ id: number; full_name: string }[]>("/api/v1/portal/people");
      return res.ok ? res.data ?? [] : [];
    },
  );

  const [classicList] = createResource(
    () => ({ seg: seg(), on: classic() }),
    async ({ seg: s, on }) => {
      if (!on) return [] as unknown[];
      const path =
        s === "orders"
          ? "/api/v1/portal/orders"
          : s === "invoices"
            ? "/api/v1/portal/invoices"
            : "/api/v1/portal/tickets";
      const res = await portalFetch<unknown[]>(`${path}?pageSize=50&order=desc`);
      if (!res.ok) throw new Error(res.message ?? "Failed to load.");
      return res.data ?? [];
    },
  );

  return (
    <PortalLayout title={meta().title} subtitle={meta().subtitle}>
      <Show when={planned()}>
        <HrNotice>
          <b>Planned</b> for this portal surface. Needs backend before live actions.
        </HrNotice>
        <HrEmpty title="Nothing here yet" hint="This section is marked Planned in the product design." />
      </Show>

      <Show when={seg() === "employees"}>
        <HrTcard>
          <Show when={people.loading}>
            <LoadingText class="text-sm text-text-secondary" as="p" />
          </Show>
          <Show when={!people.loading}>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={people() ?? []} fallback={<tr><td class="text-text-secondary">No people listed.</td></tr>}>
                    {(row) => (
                      <tr>
                        <td>{row.full_name}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </HrTcard>
      </Show>

      <Show when={seg() === "dtr"}>
        <HrNotice>
          Cut-off lock, return with remarks, version history, and receipts are <HrPlanned />. You can submit a time
          file below.
        </HrNotice>
      </Show>

      <Show when={hrTab() && seg() !== "employees"}>
        <PortalHrTab tab={hrTab()!} />
      </Show>

      <Show when={classic()}>
        <Show when={classicList.loading}>
          <LoadingText class="text-sm text-text-secondary" as="p" />
        </Show>
        <Show when={classicList.error}>
          <p class="text-sm text-red-600">{(classicList.error as Error).message}</p>
        </Show>
        <Show when={!classicList.loading && !classicList.error && seg() === "orders"}>
          <HrTcard>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(classicList() ?? []) as PortalOrder[]} fallback={<tr><td colSpan={4}>No orders.</td></tr>}>
                    {(row) => (
                      <tr>
                        <td>{row.order_no}</td>
                        <td>{row.order_date}</td>
                        <td class="capitalize">{row.status.replace(/_/g, " ")}</td>
                        <td class="num">{formatMoney(row.grand_total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </HrTcard>
        </Show>
        <Show when={!classicList.loading && !classicList.error && seg() === "invoices"}>
          <HrTcard>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th class="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(classicList() ?? []) as PortalInvoice[]} fallback={<tr><td colSpan={4}>No invoices.</td></tr>}>
                    {(row) => (
                      <tr>
                        <td>{row.sales_no}</td>
                        <td>{row.order_date}</td>
                        <td class="capitalize">{row.status}</td>
                        <td class="num">{formatMoney(row.grand_total)}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </HrTcard>
        </Show>
        <Show when={!classicList.loading && !classicList.error && seg() === "tickets"}>
          <HrTcard>
            <div class="hr-tbl-wrap">
              <table class="hr-tbl">
                <thead>
                  <tr>
                    <th>Ticket #</th>
                    <th>Subject</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={(classicList() ?? []) as PortalTicket[]} fallback={<tr><td colSpan={3}>No tickets.</td></tr>}>
                    {(row) => (
                      <tr>
                        <td>{row.ticket_no}</td>
                        <td>{row.subject}</td>
                        <td class="capitalize">{row.status.replace(/_/g, " ")}</td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </HrTcard>
        </Show>
      </Show>
    </PortalLayout>
  );
}
