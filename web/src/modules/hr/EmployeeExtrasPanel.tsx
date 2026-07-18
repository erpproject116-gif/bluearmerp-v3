import { createSignal, For, Show, createResource } from "solid-js";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
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
type EmpDoc = {
  id: number;
  doc_type: string;
  title: string;
  file_url: string;
  file_name?: string;
  has_file?: boolean;
  created_at?: string;
};

const DOC_TYPES = [
  "201_form",
  "resume",
  "contract",
  "id_gov",
  "id_sss",
  "id_philhealth",
  "id_pagibig",
  "id_tin",
  "nbi",
  "medical",
  "certificate",
  "clearance",
  "photo",
  "other",
];

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

/** Pay item assignments + 201 file docs for an existing employee. */
export function EmployeeExtrasPanel(props: { employeeId: number; documentsOnly?: boolean }) {
  const toast = useToast();
  const [typeId, setTypeId] = createSignal("");
  const [amount, setAmount] = createSignal("");
  const [docType, setDocType] = createSignal("201_form");
  const [docTitle, setDocTitle] = createSignal("");
  const [docUrl, setDocUrl] = createSignal("");
  const [uploading, setUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

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

  const uploadFile = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType());
      fd.append("title", docTitle().trim() || file.name);
      const res = await fetch(`${apiBase}/api/v1/hr/employees/${props.employeeId}/documents`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      const body = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !body.success) {
        toast.warning(body.message ?? "Upload failed.");
        return;
      }
      setDocTitle("");
      void refetchDocs();
      toast.success("File uploaded to 201.");
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
      if (fileInput) fileInput.value = "";
    }
  };

  const addDocUrl = async () => {
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

  const downloadDoc = async (d: EmpDoc) => {
    const res = await fetch(
      `${apiBase}/api/v1/hr/employees/${props.employeeId}/documents/${d.id}/download`,
      { headers: await authHeaders() },
    );
    if (!res.ok) {
      toast.warning("Download failed.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = d.file_name || d.title || "document";
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeDoc = async (id: number) => {
    await apiFetch(`/api/v1/hr/employee-documents/${id}`, { method: "DELETE" });
    void refetchDocs();
  };

  const docsSection = (
    <section class="col-span-full">
      <h3 class="mb-2 text-sm font-semibold text-text-primary">201 — documents</h3>
      <ul class="mb-2 space-y-1 text-sm">
        <For each={docs() ?? []}>
          {(d) => (
            <li class="flex justify-between gap-2">
              <span>
                <span class="uppercase text-text-secondary">{d.doc_type}</span> — {d.title}
                <Show when={d.has_file}>
                  {" "}
                  <button
                    type="button"
                    class="text-brand-700 hover:underline"
                    onClick={() => void downloadDoc(d)}
                  >
                    download
                  </button>
                </Show>
                <Show when={!d.has_file && d.file_url}>
                  {" "}
                  <a href={d.file_url} target="_blank" rel="noreferrer" class="text-brand-700 hover:underline">
                    open link
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
      <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <select class={inputClass} value={docType()} onChange={(e) => setDocType(e.currentTarget.value)}>
          <For each={DOC_TYPES}>{(t) => <option value={t}>{t}</option>}</For>
        </select>
        <input
          class={inputClass}
          placeholder="Title"
          value={docTitle()}
          onInput={(e) => setDocTitle(e.currentTarget.value)}
        />
        <input
          ref={(el) => {
            fileInput = el;
          }}
          type="file"
          class={inputClass}
          disabled={uploading()}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          disabled={uploading()}
          onClick={() => fileInput?.click()}
        >
          {uploading() ? "Uploading…" : "Upload file"}
        </button>
      </div>
      <div class="mt-2 grid gap-2 sm:grid-cols-3">
        <Field label="">
          <input
            class={inputClass}
            placeholder="Optional link URL"
            value={docUrl()}
            onInput={(e) => setDocUrl(e.currentTarget.value)}
          />
        </Field>
        <button type="button" class="rounded border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" onClick={() => void addDocUrl()}>
          Add link only
        </button>
      </div>
      <p class="mt-1 text-xs text-text-secondary">Upload a scan or PDF into the 201 file. Links still work as a fallback.</p>
    </section>
  );

  if (props.documentsOnly) {
    return <div class="col-span-full mt-2 space-y-4">{docsSection}</div>;
  }

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
      {docsSection}
    </div>
  );
}
