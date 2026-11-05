import { createMemo, createResource, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPayrollTabs } from "./HrPayrollTabs";
import { HrBadge, HrEmpty, HrPageHead, HrTcard, type HrBadgeTone } from "./HrUi";
import { formatPeso } from "../../shared/money";

type Submission = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; status: string };
type Bill = { id: number; client_name: string; site_name: string; period_start: string; period_end: string; total: number };

function statusTone(_status: string): HrBadgeTone {
  return "info";
}

export default function ClientBillingPage() {
  const toast = useToast();
  const [submissionId, setSubmissionId] = createSignal("");
  const [genOpen, setGenOpen] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [statusSeg, setStatusSeg] = createSignal("");
  const [submissions] = createResource(async () => (await apiFetch<Submission[]>("/api/v1/hr/client-time")).data ?? []);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Bill[]>("/api/v1/hr/client-bills")).data ?? []);
  const accepted = () => (submissions() ?? []).filter((row) => row.status === "accepted");

  const billedThisMonth = createMemo(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return (rows() ?? [])
      .filter((b) => (b.period_start || "").startsWith(ym) || (b.period_end || "").startsWith(ym))
      .reduce((sum, b) => sum + (Number(b.total) || 0), 0);
  });

  const billTotal = createMemo(() => (rows() ?? []).reduce((sum, b) => sum + (Number(b.total) || 0), 0));

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    return (rows() ?? []).filter((row) => {
      // Live bills have no Sent/Paid/Overdue status yet — status seg is UI chrome only until backend lands.
      if (statusSeg() && statusSeg() !== "All") {
        /* keep showing rows; badge stays informational */
      }
      if (!q) return true;
      return (
        row.client_name.toLowerCase().includes(q) ||
        row.site_name.toLowerCase().includes(q) ||
        String(row.id).includes(q)
      );
    });
  });

  const save = async () => {
    if (!submissionId()) return toast.warning("Choose an accepted submission.");
    const res = await apiFetch("/api/v1/hr/client-bills", {
      method: "POST",
      body: JSON.stringify({ submission_id: Number(submissionId()) }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the bill.");
    toast.success("Bill created from accepted time.");
    setGenOpen(false);
    void refetch();
  };

  return (
    <HrLayout>
      <HrPayrollTabs />
      <HrPageHead
        title={
          <>
            Client billing
          </>
        }
        subtitle="Bill clients from posted payroll + markup; track receivables."
        actions={
          <button type="button" class="hr-btn hr-btn-primary" onClick={() => setGenOpen(true)}>
            Generate from payroll run
          </button>
        }
      />


      <div class="hr-kpis mt-3 mb-3">
        <a class="hr-kpi" href="#bills">
          <div class="v">{rows() ? formatPeso(billedThisMonth()) : "—"}</div>
          <div class="l">Billed this month</div>
        </a>
        <a class="hr-kpi" href="#bills" title="Needs due-date status">
          <div class="v">—</div>
          <div class="l">
            Overdue
          </div>
        </a>
        <a class="hr-kpi" href="#bills" title="Needs markup field">
          <div class="v">—</div>
          <div class="l">
            Avg markup
          </div>
        </a>
        <a class="hr-kpi" href="#bills">
          <div class="v">{rows() ? formatPeso(billTotal()) : "—"}</div>
          <div class="l">Open bills total</div>
        </a>
      </div>

      <div id="bills">
      <HrTcard
        class="mt-1"
        toolbar={
          <>
            <input
              class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
              placeholder="Search invoice or client…"
              aria-label="Search"
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
            <div class="hr-seg" role="group" aria-label="Status">
              <button type="button" classList={{ on: statusSeg() === "" }} onClick={() => setStatusSeg("")}>
                All
              </button>
              <button type="button" classList={{ on: statusSeg() === "Sent" }} onClick={() => setStatusSeg("Sent")} title="Needs backend status">
                Sent
              </button>
              <button type="button" classList={{ on: statusSeg() === "Paid" }} onClick={() => setStatusSeg("Paid")} title="Needs backend status">
                Paid
              </button>
              <button type="button" classList={{ on: statusSeg() === "Overdue" }} onClick={() => setStatusSeg("Overdue")} title="Needs backend status">
                Overdue
              </button>
            </div>
          </>
        }
      >
        <div class="hr-tbl-wrap">
          <table class="hr-tbl">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Period</th>
                <th class="num">Amount</th>
                <th class="num">
                  VAT 12%
                </th>
                <th>Status</th>
                <th>
                  Due
                </th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              <For
                each={filtered()}
                fallback={
                  <tr>
                    <td colspan="8">
                      <HrEmpty title="No bills yet" hint="Generate from an accepted client time submission." />
                    </td>
                  </tr>
                }
              >
                {(row) => (
                  <tr>
                    <td class="font-mono text-sm">BILL-{row.id}</td>
                    <td>
                      <div class="font-semibold">{row.client_name}</div>
                      <div class="hr-muted">{row.site_name}</div>
                    </td>
                    <td>
                      {row.period_start} – {row.period_end}
                    </td>
                    <td class="num">{formatPeso(row.total)}</td>
                    <td class="num hr-muted">—</td>
                    <td>
                      <HrBadge tone={statusTone("open")}>Open</HrBadge>
                    </td>
                    <td class="hr-muted">—</td>
                    <td>
                      <details class="hr-menu hr-rowmenu">
                        <summary class="hr-rowmenu-btn" aria-label="Row actions">
                          ⋯
                        </summary>
                        <div>
                          <button type="button" class="menu-item" disabled title="Needs backend">
                            Send
                          </button>
                          <button type="button" class="menu-item" disabled title="Needs backend">
                            Record payment
                          </button>
                          <button type="button" class="menu-item" disabled title="Needs backend">
                            Statement of account
                          </button>
                        </div>
                      </details>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </HrTcard>
      </div>

      <Show when={genOpen()}>
        <div
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Generate bill"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Generate bill</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setGenOpen(false)}>
                ✕
              </button>
            </div>
            <p class="mb-3 text-sm text-text-secondary">
              Live path today: accepted client time × site bill rate. Generate from posted payroll run + markup is{" "}.
            </p>
            <Field label="Accepted time submission">
              <select class={inputClass} value={submissionId()} onChange={(e) => setSubmissionId(e.currentTarget.value)}>
                <option value="">Choose…</option>
                <For each={accepted()}>
                  {(row) => (
                    <option value={row.id}>
                      {row.client_name} · {row.site_name} · {row.period_start}
                    </option>
                  )}
                </For>
              </select>
            </Field>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setGenOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Create bill
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
