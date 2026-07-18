import { createSignal, For, Show, createResource } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { formatPeso } from "../../shared/money";

type PayItemType = { id: number; item_code: string; item_name: string; item_kind: string };
type EmpPayItem = {
  id: number;
  pay_item_type_id: number;
  item_code: string;
  item_name: string;
  item_kind: string;
  amount: number;
  is_active: boolean;
};
type EmpDoc = { id: number; doc_type: string; title: string; file_url: string; created_at?: string };

const DOC_TYPES = [
  "resume", "contract", "id_gov", "id_sss", "id_philhealth", "id_pagibig", "id_tin",
  "nbi", "medical", "certificate", "clearance", "photo", "other",
];

/** Pay item assignments + 201 file docs for an existing employee. */
export function EmployeeExtrasPanel(props: { employeeId: number }) {
  const toast = useToast();
  const [typeId, setTypeId] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [docType, setDocType] = createSignal("other");
  const [docTitle, setDocTitle] = createSignal("");
  const [docUrl, setDocUrl] = createSignal("");

  const [payItems, { refetch: refetchPay }] = createResource(
    () => props.employeeId,
    async (id) => {
      const res = await apiFetch<EmpPayItem[]>(`/api/v1/hr/employees/${id}/pay-items`);
      return res.data ?? [];
    },
  );
  const [types] = createResource(async () => {
    const res = await apiFetch<PayItemType[]>("/api/v1/hr/pay-item-types?page=1&pageSize=200&active=1");
    return res.data ?? [];
  });
  const [docs, { refetch: refetchDocs }] = createResource(
    () => props.employeeId,
    async (id) => {
      const res = await apiFetch<EmpDoc[]>(`/api/v1/hr/employees/${id}/documents`);
      return res.data ?? [];
    },
  );

  const addPayItem = async () => {
    const tid = Number(typeId());
    const amt = Number(amount());
    if (!tid || !(amt >= 0)) {
      toast.warning("Select an item and amount.");
      return;
    }
    const res = await apiFetch(`/api/v1/hr/employees/${props.employeeId}/pay-items`, {
      method: "POST",
      body: JSON.stringify({ pay_item_type_id: tid, amount: amt }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed.");
      return;
    }
    setAmount("");
    void refetchPay();
    toast.success("Assigned.");
  };

  const removePayItem = async (id: number) => {
    await apiFetch(`/api/v1/hr/employee-pay-items/${id}`, { method: "DELETE" });
    void refetchPay();
  };

  const addDoc = async () => {
    if (!docTitle().trim()) {
      toast.warning("Title required.");
      return;
    }
    const res = await apiFetch(`/api/v1/hr/employees/${props.employeeId}/documents`, {
      method: "POST",
      body: JSON.stringify({
        doc_type: docType(),
        title: docTitle().trim(),
        file_url: docUrl().trim(),
        file_name: docTitle().trim(),
      }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed.");
      return;
    }
    setDocTitle("");
    setDocUrl("");
    void refetchDocs();
    toast.success("Added to 201 file.");
  };

  const removeDoc = async (id: number) => {
    await apiFetch(`/api/v1/hr/employee-documents/${id}`, { method: "DELETE" });
    void refetchDocs();
  };

  return (
    <div class="col-span-full mt-4 space-y-4 border-t border-stroke pt-4">
      <section>
        <h3 class="mb-2 text-sm font-semibold">Recurring pay items</h3>
        <ul class="mb-2 space-y-1 text-sm">
          <For each={payItems() ?? []}>
            {(p) => (
              <li class="flex justify-between gap-2">
                <span>
                  {p.item_code} — {p.item_name}{" "}
                  <span class="tabular-nums text-text-secondary">{formatPeso(p.amount)}</span>
                </span>
                <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => void removePayItem(p.id)}>
                  Remove
                </button>
              </li>
            )}
          </For>
        </ul>
        <div class="grid gap-2 sm:grid-cols-3">
          <select class={inputClass} value={typeId()} onChange={(e) => setTypeId(e.currentTarget.value)}>
            <option value="">Item…</option>
            <For each={types() ?? []}>
              {(t) => (
                <option value={t.id}>
                  [{t.item_kind}] {t.item_code} — {t.item_name}
                </option>
              )}
            </For>
          </select>
          <input
            type="number"
            min="0"
            step="0.01"
            class={inputClass}
            placeholder="Amount"
            value={amount()}
            onInput={(e) => setAmount(e.currentTarget.value)}
          />
          <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void addPayItem()}>
            Assign
          </button>
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold">201 file</h3>
        <ul class="mb-2 space-y-1 text-sm">
          <For each={docs() ?? []}>
            {(d) => (
              <li class="flex justify-between gap-2">
                <span>
                  <span class="uppercase text-text-secondary">{d.doc_type}</span> — {d.title}
                  <Show when={d.file_url}>
                    {" "}
                    <a href={d.file_url} target="_blank" rel="noreferrer" class="text-brand-700 hover:underline">
                      open
                    </a>
                  </Show>
                </span>
                <button type="button" class="text-xs text-red-600 hover:underline" onClick={() => void removeDoc(d.id)}>
                  Remove
                </button>
              </li>
            )}
          </For>
        </ul>
        <div class="grid gap-2 sm:grid-cols-4">
          <select class={inputClass} value={docType()} onChange={(e) => setDocType(e.currentTarget.value)}>
            <For each={DOC_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
          </select>
          <Field label="">
            <input class={inputClass} placeholder="Title" value={docTitle()} onInput={(e) => setDocTitle(e.currentTarget.value)} />
          </Field>
          <input class={inputClass} placeholder="File URL / path" value={docUrl()} onInput={(e) => setDocUrl(e.currentTarget.value)} />
          <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void addDoc()}>
            Add
          </button>
        </div>
        <p class="mt-1 text-xs text-text-secondary">Upload binary storage comes later — paste a link or path for now.</p>
      </section>
    </div>
  );
}
