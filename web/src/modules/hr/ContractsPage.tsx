import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { formatAmount } from "../../shared/money";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrPageHead, type HrBadgeTone } from "./HrUi";
import { siteChoices, type SiteChoice } from "./siteChoices";

type Order = { id: number; site_name: string; client_name: string; pay_rate: number; bill_rate: number };
type Posting = {
  id: number;
  site_name: string;
  client_name: string;
  title: string;
  headcount: number;
  status: string;
  manpower_request_id?: number | null;
};
type RequestRow = { id: number; site_id: number; site_name: string; client_name: string; details: string; status: string };

function postingTone(status: string): HrBadgeTone {
  const s = status.toLowerCase();
  if (s === "open" || s === "active" || s === "published") return "success";
  if (s === "draft") return "warning";
  if (s === "closed" || s === "cancelled") return "neutral";
  return "info";
}

export default function ContractsPage() {
  const toast = useToast();
  const [siteId, setSiteId] = createSignal("");
  const [pay, setPay] = createSignal("");
  const [bill, setBill] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [headcount, setHeadcount] = createSignal("1");
  const [requestId, setRequestId] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [innerTab, setInnerTab] = createSignal<"orders" | "openings">("orders");
  const [search, setSearch] = createSignal("");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [showAmounts, setShowAmounts] = createSignal(false);
  const [clients] = createResource(siteChoices);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Order[]>("/api/v1/hr/job-orders")).data ?? []);
  const [postings, { refetch: refetchPostings }] = createResource(async () => (await apiFetch<Posting[]>("/api/v1/hr/job-postings")).data ?? []);
  const [requests] = createResource(async () => (await apiFetch<RequestRow[]>("/api/v1/hr/manpower-requests")).data ?? []);

  const filteredOrders = createMemo(() => {
    const q = search().trim().toLowerCase();
    const all = rows() ?? [];
    if (!q) return all;
    return all.filter((row) => row.client_name.toLowerCase().includes(q) || row.site_name.toLowerCase().includes(q));
  });

  const filteredPostings = createMemo(() => {
    const q = search().trim().toLowerCase();
    const all = postings() ?? [];
    if (!q) return all;
    return all.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        row.client_name.toLowerCase().includes(q) ||
        row.site_name.toLowerCase().includes(q),
    );
  });

  const save = async () => {
    if (!siteId()) return toast.warning("Choose a site.");
    const res = await apiFetch("/api/v1/hr/job-orders", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), pay_rate: Number(pay()) || 0, bill_rate: Number(bill()) || 0 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the job order.");
    setPay("");
    setBill("");
    setModalOpen(false);
    void refetch();
    toast.success("Job order saved.");
  };

  const savePosting = async () => {
    const req = Number(requestId()) || 0;
    if (req > 0) {
      const res = await apiFetch(`/api/v1/hr/manpower-requests/${req}/publish-opening`, {
        method: "POST",
        body: JSON.stringify({ title: title().trim() || undefined }),
      });
      if (!res.success) return toast.warning(res.message ?? "Could not publish opening.");
      setTitle("");
      setRequestId("");
      void refetchPostings();
      toast.success("Opening published from manpower request.");
      return;
    }
    if (!siteId() || !title().trim()) return toast.warning("Choose a site and a title, or pick a manpower request.");
    const res = await apiFetch("/api/v1/hr/job-postings", {
      method: "POST",
      body: JSON.stringify({ site_id: Number(siteId()), title: title().trim(), headcount: Number(headcount()) || 1 }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the posting.");
    setTitle("");
    void refetchPostings();
    toast.success("Opening saved.");
  };

  return (
    <HrLayout>
      <HrPageHead
        title={
          <>
            Contracts &amp; job orders
          </>
        }
        subtitle="Job orders hold the pay rate and the bill rate. Public openings are separate and do not show rates."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => setModalOpen(true)}>
            + New job order
          </button>
        }
      />


      <div class="hr-tabs" role="tablist">
        <button type="button" classList={{ on: innerTab() === "orders" }} onClick={() => setInnerTab("orders")}>
          Job orders
        </button>
        <button type="button" classList={{ on: innerTab() === "openings" }} onClick={() => setInnerTab("openings")}>
          Public openings
        </button>
        <button type="button" disabled title="Needs contract end dates">
          Ending ≤30d
        </button>
      </div>

      <Show when={innerTab() === "orders"}>
        <SpreadsheetGrid
          columns={[
            { key: "client_name", header: "Client" },
            { key: "site_name", header: "Site" },
            {
              key: "pay_rate",
              header: "Pay rate (₱)",
              render: (row) => (
                <Show when={showAmounts()} fallback={<span class="hr-masked">••••••</span>}>
                  <span class="tabular-nums">{formatAmount(row.pay_rate)}</span>
                </Show>
              ),
              exportValue: (row) => row.pay_rate,
            },
            {
              key: "bill_rate",
              header: "Bill rate (₱)",
              render: (row) => (
                <Show when={showAmounts()} fallback={<span class="hr-masked">••••••</span>}>
                  <span class="tabular-nums">{formatAmount(row.bill_rate)}</span>
                </Show>
              ),
              exportValue: (row) => row.bill_rate,
            },
            {
              key: "status",
              header: "Status",
              sortable: false,
              render: () => <HrBadge tone="success">Active</HrBadge>,
              exportValue: () => "Active",
            },
          ]}
          rows={filteredOrders()}
          loading={rows.loading}
          selectedId={selected()}
          onSelect={setSelected}
          onEdit={(row) => setSelected(row.id)}
          onNew={() => setModalOpen(true)}
          showNew={false}
          hideExport
          codeKey="client_name"
          nameKey="site_name"
          search={search()}
          onSearchChange={setSearch}
          searchPlaceholder="Search client or site…"
          toolbarExtra={
            <button type="button" class="hr-btn hr-btn-sm" onClick={() => setShowAmounts((v) => !v)}>
              {showAmounts() ? "🙈 Hide amounts" : "👁 Show amounts"}
            </button>
          }
        />
      </Show>

      <Show when={innerTab() === "openings"}>
        <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 grid-cols-1 min-[1024px]:grid-cols-5">
          <Field label="From manpower request">
            <select
              class={inputClass}
              value={requestId()}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setRequestId(v);
                const row = (requests() ?? []).find((r) => String(r.id) === v);
                if (row) {
                  setSiteId(String(row.site_id));
                  if (!title().trim()) setTitle(row.details || "");
                }
              }}
            >
              <option value="">Manual (no request)</option>
              <For each={requests() ?? []}>
                {(r) => (
                  <option value={r.id}>
                    #{r.id} · {r.client_name} · {r.site_name} · {r.status}
                  </option>
                )}
              </For>
            </select>
          </Field>
          <SiteField sites={clients() ?? []} value={siteId()} onChange={setSiteId} />
          <Field label="Title">
            <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
          </Field>
          <Field label="Headcount">
            <input class={inputClass} value={headcount()} onInput={(e) => setHeadcount(e.currentTarget.value)} disabled={!!requestId()} />
          </Field>
          <button type="button" class="hr-btn hr-btn-primary self-end" onClick={() => void savePosting()}>
            {requestId() ? "Publish from request" : "Save opening"}
          </button>
        </div>
        <SpreadsheetGrid
          columns={[
            { key: "title", header: "Title" },
            { key: "client_name", header: "Client" },
            { key: "site_name", header: "Site" },
            { key: "headcount", header: "Headcount" },
            {
              key: "manpower_request_id",
              header: "Request",
              render: (row) => (row.manpower_request_id ? `#${row.manpower_request_id}` : "—"),
            },
            {
              key: "status",
              header: "Status",
              render: (row) => <HrBadge tone={postingTone(row.status)}>{row.status}</HrBadge>,
            },
          ]}
          rows={filteredPostings()}
          loading={postings.loading}
          selectedId={null}
          onSelect={() => {}}
          onEdit={() => {}}
          onNew={() => {}}
          showNew={false}
          hideExport
          codeKey="title"
          nameKey="client_name"
          search={search()}
          onSearchChange={setSearch}
          searchPlaceholder="Search openings…"
        />
      </Show>

      <Show when={modalOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New job order"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") setModalOpen(false);
          }}
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New job order</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <SiteField sites={clients() ?? []} value={siteId()} onChange={setSiteId} />
              <Field label="Pay rate">
                <input class={inputClass} value={pay()} onInput={(e) => setPay(e.currentTarget.value)} />
              </Field>
              <Field label="Bill rate">
                <input class={inputClass} value={bill()} onInput={(e) => setBill(e.currentTarget.value)} />
              </Field>
              <div class="rounded-lg border border-dashed border-stroke bg-panel p-3 text-sm">
                <b>Contract end date</b>
                <p class="hr-muted mt-1">Needs backend before ending-soon KPIs work.</p>
              </div>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}

function SiteField(props: { sites: SiteChoice[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Site">
      <select class={inputClass} value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>
        <option value="">Choose</option>
        <For each={props.sites}>{(site) => <option value={site.id}>{site.client_name} · {site.site_name}</option>}</For>
      </select>
    </Field>
  );
}
