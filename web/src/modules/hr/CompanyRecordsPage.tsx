import { createMemo, createSignal, For, Show } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { LookupCombo } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrBadge, HrEmpty, HrPageHead, type HrBadgeTone } from "./HrUi";

type RecordKind = "policy" | "announcement" | "event";
type CompanyRecord = {
  id: number;
  record_kind: RecordKind;
  title: string;
  body: string;
  record_date?: string | null;
  status: string;
};

const KINDS: { value: RecordKind; label: string; tone: HrBadgeTone }[] = [
  { value: "policy", label: "Policy", tone: "brand" },
  { value: "announcement", label: "Announcement", tone: "info" },
  { value: "event", label: "Event", tone: "warning" },
];

/** UI value → API doc_type (constraint on hr_employee_documents). */
const DOC_TYPES: { value: string; api: string; label: string }[] = [
  { value: "contract", api: "contract", label: "Contract" },
  { value: "nbi", api: "nbi", label: "NBI clearance" },
  { value: "medical", api: "medical", label: "Medical" },
  { value: "memo", api: "other", label: "Memo" },
  { value: "other", api: "other", label: "Other" },
];

function kindMeta(kind: string) {
  return KINDS.find((k) => k.value === kind) ?? { value: kind as RecordKind, label: kind, tone: "neutral" as HrBadgeTone };
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

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

export default function CompanyRecordsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kindSeg, setKindSeg] = createSignal<RecordKind | "">("");
  const [search, setSearch] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [recordDate, setRecordDate] = createSignal("");
  const [newKind, setNewKind] = createSignal<RecordKind>("policy");
  const [open, setOpen] = createSignal(false);
  const [upOpen, setUpOpen] = createSignal(false);
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [docTypeUi, setDocTypeUi] = createSignal("contract");
  const [expiry, setExpiry] = createSignal("");
  const [uploading, setUploading] = createSignal(false);
  let fileInput: HTMLInputElement | undefined;

  const docTypeApi = () => DOC_TYPES.find((d) => d.value === docTypeUi())?.api ?? "other";

  const records = createQuery(() => ({
    queryKey: ["hr-company-records"],
    queryFn: async () => (await apiFetch<CompanyRecord[]>("/api/v1/hr/company-records")).data ?? [],
  }));

  const filtered = createMemo(() => {
    const q = search().trim().toLowerCase();
    const kind = kindSeg();
    return (records.data ?? []).filter((row) => {
      if (kind && row.record_kind !== kind) return false;
      if (!q) return true;
      return (
        row.title.toLowerCase().includes(q) ||
        (row.body || "").toLowerCase().includes(q) ||
        kindMeta(row.record_kind).label.toLowerCase().includes(q)
      );
    });
  });

  const resetNew = () => {
    setTitle("");
    setBody("");
    setRecordDate("");
    setNewKind("policy");
  };

  const save = async () => {
    if (!title().trim()) return toast.warning("Title is required.");
    const res = await apiFetch("/api/v1/hr/company-records", {
      method: "POST",
      body: JSON.stringify({
        record_kind: newKind(),
        title: title().trim(),
        body: body().trim(),
        record_date: recordDate() || null,
      }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save.");
    toast.success("Record saved.");
    resetNew();
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-company-records"] });
  };

  const upload201 = async () => {
    const id = empId();
    if (!id) return toast.warning("Select an employee.");
    const file = fileInput?.files?.[0];
    if (!file) return toast.warning("Choose a file.");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docTypeApi());
      fd.append("title", file.name);
      const res = await fetch(`${apiBase}/api/v1/hr/employees/${id}/documents`, {
        method: "POST",
        headers: await authHeaders(),
        body: fd,
      });
      const bodyJson = (await res.json()) as { success?: boolean; message?: string; data?: { id: number } };
      if (!res.ok || !bodyJson.success) {
        toast.warning(bodyJson.message ?? "Upload failed.");
        return;
      }
      const docId = bodyJson.data?.id;
      if (docId && expiry()) {
        const patch = await apiFetch(`/api/v1/hr/employee-documents/${docId}/expiry`, {
          method: "PATCH",
          body: JSON.stringify({ expires_on: expiry() }),
        });
        if (!patch.success) toast.warning(patch.message ?? "File uploaded; expiry could not be saved.");
      }
      toast.success("Document added to 201 file.");
      setUpOpen(false);
      setEmpId(null);
      setEmpLabel("");
      setDocTypeUi("contract");
      setExpiry("");
      if (fileInput) fileInput.value = "";
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <HrLayout>
      <div class="hr-crumb">HR &amp; Payroll › Policies &amp; notices</div>
      <HrPageHead
        title="Policies &amp; notices"
        subtitle="These records do not change pay."
        actions={
          <>
            <button
              type="button"
              class="hr-btn"
              onClick={() => {
                setEmpId(null);
                setEmpLabel("");
                setDocTypeUi("contract");
                setExpiry("");
                setUpOpen(true);
              }}
            >
              Upload to 201 file
            </button>
            <button
              type="button"
              class="hr-btn hr-btn-primary"
              onClick={() => {
                resetNew();
                setOpen(true);
              }}
            >
              + New record
            </button>
          </>
        }
      />

      <div class="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stroke bg-surface p-3 shadow-sm">
        <input
          class="grow rounded-lg border border-stroke bg-surface px-3 py-2 text-sm"
          placeholder="Search records…"
          aria-label="Search records"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <div class="hr-seg" role="group" aria-label="Record type">
          <button type="button" classList={{ on: kindSeg() === "" }} onClick={() => setKindSeg("")}>
            All
          </button>
          <For each={KINDS}>
            {(k) => (
              <button type="button" classList={{ on: kindSeg() === k.value }} onClick={() => setKindSeg(k.value)}>
                {k.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={records.isLoading}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={records.isError}>
        <p class="text-sm text-red-700">{records.error?.message ?? "Failed to load records."}</p>
      </Show>
      <Show when={!records.isLoading && !records.isError}>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <For
            each={filtered()}
            fallback={
              <div class="sm:col-span-2 xl:col-span-3">
                <HrEmpty title="No records" hint="Try a different search or add a new record." />
              </div>
            }
          >
            {(row) => {
              const meta = () => kindMeta(row.record_kind);
              return (
                <article class="rounded-xl border border-stroke bg-surface p-4 shadow-sm">
                  <div class="flex items-start justify-between gap-2">
                    <HrBadge tone={meta().tone}>{meta().label}</HrBadge>
                    <span class="text-xs text-text-secondary">{formatDate(row.record_date)}</span>
                  </div>
                  <h3 class="mt-2 mb-1 text-base font-semibold">{row.title}</h3>
                  <Show when={row.body}>
                    <p class="m-0 text-sm text-text-secondary">{row.body}</p>
                  </Show>
                </article>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={open()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="New record"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">New record</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <Field label="Type">
                <select class={inputClass} value={newKind()} onChange={(e) => setNewKind(e.currentTarget.value as RecordKind)}>
                  <For each={KINDS}>{(k) => <option value={k.value}>{k.label}</option>}</For>
                </select>
              </Field>
              <Field label="Title">
                <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
              </Field>
              <Field label="Date">
                <input type="date" class={inputClass} value={recordDate()} onInput={(e) => setRecordDate(e.currentTarget.value)} />
              </Field>
              <Field label="Details">
                <textarea class={inputClass} rows={3} value={body()} onInput={(e) => setBody(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" onClick={() => void save()}>
                Save
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={upOpen()}>
        <div
          class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Upload to 201 file"
        >
          <div class="w-full max-w-md rounded-lg border border-stroke bg-surface p-4 shadow-lg">
            <div class="mb-3 flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold">Upload to 201 file</h2>
              <button type="button" class="hr-btn hr-btn-sm" aria-label="Close" onClick={() => setUpOpen(false)}>
                ✕
              </button>
            </div>
            <div class="grid gap-3">
              <LookupCombo
                label="Employee"
                value={empLabel}
                selectedId={empId}
                onInput={setEmpLabel}
                onSelect={(o) => {
                  setEmpId(o.id);
                  setEmpLabel(o.label);
                }}
                onClear={() => {
                  setEmpId(null);
                  setEmpLabel("");
                }}
                fetchOptions={(q) => fetchEmployeeOptions(q, "active")}
                placeholder="Search employees…"
              />
              <Field label="Document type">
                <select class={inputClass} value={docTypeUi()} onChange={(e) => setDocTypeUi(e.currentTarget.value)}>
                  <For each={DOC_TYPES}>{(d) => <option value={d.value}>{d.label}</option>}</For>
                </select>
              </Field>
              <Field label="File">
                <input
                  ref={(el) => {
                    fileInput = el;
                  }}
                  type="file"
                  class={inputClass}
                />
              </Field>
              <Field label="Expiry date (if any)">
                <input type="date" class={inputClass} value={expiry()} onInput={(e) => setExpiry(e.currentTarget.value)} />
              </Field>
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" class="hr-btn" onClick={() => setUpOpen(false)}>
                Cancel
              </button>
              <button type="button" class="hr-btn hr-btn-primary" disabled={uploading()} onClick={() => void upload201()}>
                {uploading() ? "Uploading…" : "Upload"}
              </button>
            </div>
          </div>
        </div>
      </Show>
    </HrLayout>
  );
}
