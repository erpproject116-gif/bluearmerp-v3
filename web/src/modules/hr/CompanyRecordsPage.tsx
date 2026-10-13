import { createSignal, For } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type RecordKind = "policy" | "announcement" | "event";
type CompanyRecord = {
  id: number;
  record_kind: RecordKind;
  title: string;
  body: string;
  record_date?: string | null;
  status: string;
};

const KINDS: { value: RecordKind; label: string }[] = [
  { value: "policy", label: "Policy" },
  { value: "announcement", label: "Announcement" },
  { value: "event", label: "Event" },
];

export default function CompanyRecordsPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = createSignal<RecordKind | "">("");
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [recordDate, setRecordDate] = createSignal("");
  const [newKind, setNewKind] = createSignal<RecordKind>("policy");
  const [open, setOpen] = createSignal(false);

  const records = createQuery(() => ({
    queryKey: ["hr-company-records", kind()],
    queryFn: async () => {
      const qs = kind() ? `?kind=${kind()}` : "";
      return (await apiFetch<CompanyRecord[]>(`/api/v1/hr/company-records${qs}`)).data ?? [];
    },
  }));

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
    setTitle("");
    setBody("");
    setRecordDate("");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: ["hr-company-records"] });
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Policies, announcements, and events</h1>
      <p class="mb-6 text-sm text-text-secondary">These records do not change pay.</p>
      <button type="button" class="mb-4 rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => setOpen(true)}>
        New record
      </button>
      <EntityModal open={open()} title="New record" onClose={() => setOpen(false)} onSave={() => void save()} saveLabel="Save record">
        <Field label="Kind">
          <select class={inputClass} value={newKind()} onChange={(e) => setNewKind(e.currentTarget.value as RecordKind)}>
            <For each={KINDS}>{(k) => <option value={k.value}>{k.label}</option>}</For>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" class={inputClass} value={recordDate()} onInput={(e) => setRecordDate(e.currentTarget.value)} />
        </Field>
        <Field label="Title">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Details">
          <textarea class={inputClass} rows={2} value={body()} onInput={(e) => setBody(e.currentTarget.value)} />
        </Field>
      </EntityModal>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-lg font-medium">Records</h2>
          <select class={inputClass + " w-44"} value={kind()} onChange={(e) => setKind(e.currentTarget.value as RecordKind | "")}>
            <option value="">All</option>
            <For each={KINDS}>{(k) => <option value={k.value}>{k.label}</option>}</For>
          </select>
        </div>
        <For each={records.data ?? []} fallback={<p class="text-sm text-text-secondary">No records yet.</p>}>
          {(row) => (
            <article class="border-b border-slate-100 py-3 text-sm">
              <p class="font-medium">{row.title}</p>
              <p class="text-text-secondary">
                {row.record_kind}
                {row.record_date ? ` · ${row.record_date}` : ""}
              </p>
              {row.body ? <p class="mt-1">{row.body}</p> : null}
            </article>
          )}
        </For>
      </section>
    </HrLayout>
  );
}
