import { uiLabel } from "../../shared/branding/uiLabel";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { handleSaveResult } from "../../shared/handleSaveResult";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { GridExportButtons } from "../../shared/gridExport";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";

type JournalEntryRow = { id: number; entry_no: string; status: string; remarks?: string };

type JournalLine = { account_code: string; debit: string; credit: string; dept_id: string; project_id: string };
type AccountOption = { id: number; account_code: string; account_name: string; is_active: boolean };
type DimOption = { id: number; name?: string; department_name?: string; project_name?: string };

export default function JournalEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [statusFilter, setStatusFilter] = createSignal<"all" | "draft" | "posted">("all");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [remarks, setRemarks] = createSignal("");
  const [lines, setLines] = createSignal<JournalLine[]>([
    { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
    { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
  ]);
  const [saving, setSaving] = createSignal(false);
  const [posting, setPosting] = createSignal(false);

  const list = createQuery(() => ({
    queryKey: ["journal-entries", statusFilter()],
    queryFn: async () => {
      const qs = new URLSearchParams({ pageSize: "50" });
      if (statusFilter() !== "all") qs.set("status", statusFilter());
      const res = await apiFetch<JournalEntryRow[]>(`/api/v1/finance/journal-entries?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return res.data ?? [];
    },
  }));

  const accounts = createQuery(() => ({
    queryKey: ["finance-accounts-picker"],
    queryFn: async () => {
      const res = await apiFetch<AccountOption[]>("/api/v1/finance/accounts?page=1&pageSize=500&status=active&sort=account_code&order=asc");
      if (!res.success) throw new Error(res.message ?? "Failed to load accounts");
      return res.data ?? [];
    },
  }));

  const departments = createQuery(() => ({
    queryKey: ["hr-departments-picker"],
    queryFn: async () => {
      const res = await apiFetch<DimOption[]>("/api/v1/hr/departments?page=1&pageSize=200");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const projects = createQuery(() => ({
    queryKey: ["inv-projects-picker"],
    queryFn: async () => {
      const res = await apiFetch<DimOption[]>("/api/v1/inventory/projects?page=1&pageSize=200");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const invalidate = () => void client.invalidateQueries({ queryKey: ["journal-entries"] });

  const openCreate = () => {
    setRemarks("");
    setLines([
      { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
      { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
    ]);
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.finJournalEntry,
    draftKey: "new",
    getPayload: () => ({ remarks: remarks(), lines: lines() }),
    onApply: (payload) => {
      setRemarks(payload.remarks);
      setLines(payload.lines?.length ? payload.lines : [{ account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }, { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }]);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen(),
  });

  const createEntry = async () => {
    const parsed = lines()
      .map((ln) => ({
        account_code: ln.account_code.trim(),
        debit: Number(ln.debit) || 0,
        credit: Number(ln.credit) || 0,
        dept_id: ln.dept_id ? Number(ln.dept_id) : undefined,
        project_id: ln.project_id ? Number(ln.project_id) : undefined,
      }))
      .filter((ln) => ln.account_code);
    if (parsed.length < 2) {
      toast.warning("At least two lines with account codes are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<JournalEntryRow>("/api/v1/finance/journal-entries", {
      method: "POST",
      body: JSON.stringify({ remarks: remarks(), lines: parsed }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Draft journal entry created.")) return;
    await draft.clearOnSave();
    setModalOpen(false);
    invalidate();
  };

  const postSelected = async () => {
    const id = selectedId();
    const row = (list.data ?? []).find((r) => r.id === id);
    if (!row) {
      toast.warning("Select a draft journal entry to post.");
      return;
    }
    if (row.status !== "draft") {
      toast.warning("Only draft entries can be posted.");
      return;
    }
    setPosting(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${id}/post`, { method: "POST" });
    setPosting(false);
    if (!handleSaveResult(res, toast, "Journal entry posted.")) return;
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h1 class="text-xl font-semibold text-slate-900">Journal Entry</h1>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            Status
            <select
              class="rounded-lg border border-stroke px-2 py-1.5 text-sm text-text-primary"
              value={statusFilter()}
              onChange={(e) => setStatusFilter(e.currentTarget.value as "all" | "draft" | "posted")}
            >
              <option value="all">All</option>
              <option value="draft">Drafts only</option>
              <option value="posted">Posted only</option>
            </select>
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => invalidate()}
          >
            Refresh
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={posting()}
            onClick={() => void postSelected()}
          >
            {posting() ? "Posting…" : "Post selected"}
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            onClick={openCreate}
          >
            New draft
          </button>
          <GridExportButtons
            title="Journal Entries"
            filename="journal-entries"
            columns={[
              { key: "entry_no", header: "Entry No", value: (r) => String(r.entry_no ?? "") },
              { key: "status", header: "Status", value: (r) => String(r.status ?? "") },
              { key: "remarks", header: "Remarks", value: (r) => String(r.remarks ?? "") },
            ]}
            rows={() => (list.data ?? []) as unknown as Record<string, unknown>[]}
          />
        </div>
      </div>

      <Show when={!list.isLoading} fallback={<p class="text-sm text-slate-500">{uiLabel("common.loading")}</p>}>
        <table class="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-3 py-2 text-left w-10" />
              <th class="px-3 py-2 text-left">Entry No</th>
              <th class="px-3 py-2 text-left">Status</th>
              <th class="px-3 py-2 text-left">Remarks</th>
            </tr>
          </thead>
          <tbody>
            <For each={list.data ?? []}>
              {(row) => (
                <tr
                  classList={{
                    "border-t border-slate-100": true,
                    "bg-brand-50": selectedId() === row.id,
                  }}
                  onClick={() => setSelectedId(row.id)}
                >
                  <td class="px-3 py-2">
                    <input type="radio" checked={selectedId() === row.id} readOnly />
                  </td>
                  <td class="px-3 py-2">{row.entry_no}</td>
                  <td class="px-3 py-2 capitalize">{row.status}</td>
                  <td class="px-3 py-2">{row.remarks ?? "—"}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </Show>

      <EntityModal
        open={modalOpen()}
        title="New journal entry (draft)"
        onClose={() => setModalOpen(false)}
        onSave={() => void createEntry()}
        saving={saving()}
        wide
      >
        <draft.DraftBanner />
        <ModalFormGuide guideId="journal_entry" spanFull />
        <Field label="Remarks">
          <input class={inputClass} value={remarks()} onInput={(e) => setRemarks(e.currentTarget.value)} />
        </Field>
        <div class="col-span-2 space-y-2">
          <p class="text-sm font-medium text-text-primary">Lines</p>
          <For each={lines()}>
            {(ln, i) => (
              <div class="grid grid-cols-5 gap-2">
                <select
                  class={inputClass}
                  value={ln.account_code}
                  onChange={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, account_code: e.currentTarget.value } : r)))
                  }
                >
                  <option value="">Select account</option>
                  <For each={accounts.data ?? []}>
                    {(acc) => (
                      <option value={acc.account_code}>
                        {acc.account_code} - {acc.account_name}
                      </option>
                    )}
                  </For>
                </select>
                <select
                  class={inputClass}
                  value={ln.dept_id}
                  onChange={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, dept_id: e.currentTarget.value } : r)))
                  }
                >
                  <option value="">Dept (opt)</option>
                  <For each={departments.data ?? []}>
                    {(d) => (
                      <option value={d.id}>{d.department_name ?? d.name ?? `#${d.id}`}</option>
                    )}
                  </For>
                </select>
                <select
                  class={inputClass}
                  value={ln.project_id}
                  onChange={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, project_id: e.currentTarget.value } : r)))
                  }
                >
                  <option value="">Project (opt)</option>
                  <For each={projects.data ?? []}>
                    {(p) => (
                      <option value={p.id}>{p.project_name ?? p.name ?? `#${p.id}`}</option>
                    )}
                  </For>
                </select>
                <input
                  class={inputClass}
                  type="number"
                  placeholder="Debit"
                  value={ln.debit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, debit: e.currentTarget.value } : r)))
                  }
                />
                <input
                  class={inputClass}
                  type="number"
                  placeholder="Credit"
                  value={ln.credit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, credit: e.currentTarget.value } : r)))
                  }
                />
              </div>
            )}
          </For>
          <button
            type="button"
            class="text-sm text-brand-600 hover:underline"
            onClick={() => setLines((rows) => [...rows, { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }])}
          >
            + Add line
          </button>
        </div>
      </EntityModal>
    </div>
  );
}
