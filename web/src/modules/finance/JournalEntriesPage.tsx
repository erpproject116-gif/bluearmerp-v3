import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createEffect, createSignal, For, Show } from "solid-js";
import { useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { handleSaveResult } from "../../shared/handleSaveResult";
import { EntityModal, Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { useTransactionListState } from "../../shared/useListState";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { ActivityHistoryLink } from "../../shared/ActivityHistoryLink";

type JournalEntryRow = {
  id: number;
  entry_no: string;
  status: string;
  remarks?: string;
  entry_date?: string;
  archived_at?: string | null;
  reversed_at?: string | null;
  reversal_of_entry_id?: number | null;
  reversed_by_entry_id?: number | null;
};

type JournalEntryDetail = JournalEntryRow & {
  lines?: { account_code: string; debit: number; credit: number; dept_id?: number | null; project_id?: number | null }[];
};

type JournalLine = { account_code: string; debit: string; credit: string; dept_id: string; project_id: string };
type AccountOption = { id: number; account_code: string; account_name: string; is_active: boolean };
type DimOption = { id: number; name?: string; department_name?: string; project_name?: string };

const toolbarBtn =
  "rounded-lg border border-stroke px-3 py-2 text-sm font-medium text-text-secondary transition hover:erp-panel hover:text-text-primary disabled:opacity-50";

export default function JournalEntriesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
  const [readOnly, setReadOnly] = createSignal(false);
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useTransactionListState("updated_at");
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editId, setEditId] = createSignal<number | null>(null);
  const [remarks, setRemarks] = createSignal("");
  const [lines, setLines] = createSignal<JournalLine[]>([
    { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
    { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
  ]);
  const [saving, setSaving] = createSignal(false);
  const [posting, setPosting] = createSignal(false);
  const [acting, setActing] = createSignal(false);

  const list = createQuery(() => ({
    queryKey: ["journal-entries", page(), pageSize(), sort(), order(), q(), statusFilter()],
    queryFn: async () => {
      const qs = new URLSearchParams({
        page: String(page()),
        pageSize: String(pageSize()),
        sort: sort(),
        order: order(),
      });
      const status = statusFilter();
      if (status === "archived") {
        qs.set("status", "archived");
        qs.set("include_archived", "1");
      } else if (status) {
        qs.set("status", status);
      }
      if (q()) qs.set("q", q());
      const res = await apiFetch<JournalEntryRow[]>(`/api/v1/finance/journal-entries?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load");
      return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
    },
    placeholderData: (prev: { rows: JournalEntryRow[]; total: number } | undefined) => prev,
  }));

  createEffect(() => {
    const raw = searchParams.highlight ?? searchParams.openId;
    const id = Number(Array.isArray(raw) ? raw[0] : raw);
    if (!Number.isFinite(id) || id <= 0) return;
    if (!list.data?.rows.some((r) => r.id === id)) return;
    setSelectedId(id);
    const next = { ...searchParams } as Record<string, string | undefined>;
    delete next.highlight;
    delete next.openId;
    setSearchParams(next, { replace: true });
    requestAnimationFrame(() => {
      document.querySelector(`[data-row-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  });

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

  const selectedRow = () => (list.data?.rows ?? []).find((r) => r.id === selectedId()) ?? null;
  const isArchived = (row: JournalEntryRow) => Boolean(row.archived_at) || row.status === "cancelled";

  const openCreate = () => {
    setReadOnly(false);
    setEditId(null);
    setRemarks("");
    setLines([
      { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
      { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" },
    ]);
    setModalOpen(true);
  };

  const loadEntry = async (row: JournalEntryRow, intent: "edit" | "view") => {
    const locked = row.status !== "draft" || isArchived(row);
    if (intent === "edit" && locked) {
      toast.warning("Only draft journal entries can be edited.");
      return;
    }
    const res = await apiFetch<JournalEntryDetail>(`/api/v1/finance/journal-entries/${row.id}`);
    if (!res.success || !res.data) {
      toast.error(res.message ?? "Failed to load journal entry.");
      return;
    }
    const loaded = (res.data.lines ?? []).map((ln) => ({
      account_code: ln.account_code ?? "",
      debit: ln.debit ? String(ln.debit) : "",
      credit: ln.credit ? String(ln.credit) : "",
      dept_id: ln.dept_id ? String(ln.dept_id) : "",
      project_id: ln.project_id ? String(ln.project_id) : "",
    }));
    while (loaded.length < 2) loaded.push({ account_code: "", debit: "", credit: "", dept_id: "", project_id: "" });
    setReadOnly(intent === "view" && locked);
    setEditId(row.id);
    setRemarks(res.data.remarks ?? "");
    setLines(loaded);
    setModalOpen(true);
  };

  const openEdit = async (row = selectedRow()) => {
    if (!row) {
      toast.warning("Select a draft journal entry to edit.");
      return;
    }
    await loadEntry(row, "edit");
  };

  const openFromList = (row: JournalEntryRow) => void loadEntry(row, "view");

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.finJournalEntry,
    draftKey: "new",
    getPayload: () => ({ remarks: remarks(), lines: lines() }),
    onApply: (payload) => {
      setRemarks(payload.remarks);
      setLines(payload.lines?.length ? payload.lines : [{ account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }, { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }]);
    },
    enabled: () => modalOpen() && editId() === null,
    autoApply: () => modalOpen() && editId() === null,
  });

  const saveEntry = async () => {
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
    const id = editId();
    setSaving(true);
    const res = await apiFetch<JournalEntryRow>(
      id ? `/api/v1/finance/journal-entries/${id}` : "/api/v1/finance/journal-entries",
      { method: id ? "PUT" : "POST", body: JSON.stringify({ remarks: remarks(), lines: parsed }) },
    );
    setSaving(false);
    if (!handleSaveResult(res, toast, id ? "Draft journal entry updated." : "Draft journal entry created.")) return;
    if (!id) await draft.clearOnSave();
    setModalOpen(false);
    setEditId(null);
    invalidate();
  };

  const postSelected = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select a draft journal entry to post.");
      return;
    }
    if (row.status !== "draft") {
      toast.warning("Only draft entries can be posted.");
      return;
    }
    setPosting(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${row.id}/post`, { method: "POST" });
    setPosting(false);
    if (!handleSaveResult(res, toast, "Journal entry posted.")) return;
    invalidate();
  };

  const reverseSelected = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select a posted journal entry to reverse.");
      return;
    }
    if (row.status !== "posted" || row.reversed_by_entry_id) {
      toast.warning("Only posted entries that have not been reversed can be reversed.");
      return;
    }
    if (!window.confirm(`Reverse ${row.entry_no}? A mirrored entry will be posted today.`)) return;
    setActing(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${row.id}/reverse`, { method: "POST" });
    setActing(false);
    if (!handleSaveResult(res, toast, "Reversing entry posted.")) return;
    invalidate();
  };

  const archiveSelected = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select a journal entry to archive.");
      return;
    }
    if (isArchived(row)) {
      toast.warning("This journal entry is already archived.");
      return;
    }
    if (row.status === "posted" && !row.reversed_by_entry_id) {
      toast.warning("Reverse this posted entry before archiving it.");
      return;
    }
    if (!window.confirm(`Archive ${row.entry_no}? It stays in the books but is hidden from the default list.`)) return;
    setActing(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${row.id}/archive`, { method: "POST" });
    setActing(false);
    if (!handleSaveResult(res, toast, "Journal entry archived.")) return;
    invalidate();
  };

  const unarchiveSelected = async () => {
    const row = selectedRow();
    if (!row || !row.archived_at) {
      toast.warning("Select an archived journal entry to restore.");
      return;
    }
    setActing(true);
    const res = await apiFetch(`/api/v1/finance/journal-entries/${row.id}/unarchive`, { method: "POST" });
    setActing(false);
    if (!handleSaveResult(res, toast, "Journal entry restored.")) return;
    invalidate();
  };

  return (
    <div class="space-y-4">
      <SpreadsheetGrid<JournalEntryRow>
        columns={[
          { key: "entry_no", header: "Entry No", clickable: true },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (row) => (
              <span classList={{ "text-slate-400": isArchived(row) }}>
                <span class="capitalize">{row.status}</span>
                <Show when={row.reversed_by_entry_id}>
                  <span class="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Reversed</span>
                </Show>
                <Show when={isArchived(row)}>
                  <span class="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">Archived</span>
                </Show>
              </span>
            ),
            exportValue: (row) => row.status,
          },
          {
            key: "remarks",
            header: "Remarks",
            sortable: false,
            render: (row) => row.remarks || "—",
            exportValue: (row) => row.remarks ?? "",
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (row) => (
              <ActivityHistoryLink
                module="finance"
                targetType="fin_journal_entry"
                targetId={row.id}
                title={`History — ${row.entry_no}`}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={selectedIds()}
        onSelectionChange={setSelectedIds}
        onEdit={openFromList}
        onNew={openCreate}
        newLabel="New draft"
        codeKey="entry_no"
        nameKey="remarks"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        total={list.data?.total ?? 0}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search entry no or remarks…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={[
          { value: "", label: "All (active)" },
          { value: "draft", label: "Drafts only" },
          { value: "posted", label: "Posted only" },
          { value: "archived", label: "Archived" },
        ]}
        toolbarExtra={
          <>
            <button
              type="button"
              class={toolbarBtn}
              disabled={selectedRow()?.status !== "draft" || Boolean(selectedRow() && isArchived(selectedRow()!))}
              onClick={() => void openEdit()}
            >
              Edit
            </button>
            <button type="button" class={toolbarBtn} disabled={posting() || !selectedRow()} onClick={() => void postSelected()}>
              {posting() ? "Posting…" : "Post"}
            </button>
            <button
              type="button"
              class={toolbarBtn}
              disabled={acting() || selectedRow()?.status !== "posted" || Boolean(selectedRow()?.reversed_by_entry_id)}
              onClick={() => void reverseSelected()}
            >
              Reverse
            </button>
            <Show
              when={selectedRow()?.archived_at}
              fallback={
                <button
                  type="button"
                  class={toolbarBtn}
                  disabled={acting() || !selectedRow() || isArchived(selectedRow()!)}
                  onClick={() => void archiveSelected()}
                >
                  Archive
                </button>
              }
            >
              <button type="button" class={toolbarBtn} disabled={acting()} onClick={() => void unarchiveSelected()}>
                Restore
              </button>
            </Show>
          </>
        }
        onRefresh={invalidate}
        exportFilename="journal-entries"
        exportTitle="Journal Entries"
      />

      <EntityModal
        open={modalOpen()}
        title={
          readOnly()
            ? "Journal entry"
            : editId()
              ? "Edit journal entry (draft)"
              : "New journal entry (draft)"
        }
        onClose={() => {
          setModalOpen(false);
          setEditId(null);
          setReadOnly(false);
        }}
        onSave={() => void saveEntry()}
        saving={saving()}
        hideSave={readOnly()}
        wide
        headerActions={
          <RecordHistoryButton
            variant="button"
            targetType="fin_journal_entry"
            targetId={editId()}
            title={editId() ? `History — journal #${editId()}` : "History"}
          />
        }
      >
        <Show when={editId() === null}>
          <draft.DraftBanner />
        </Show>
        <ModalFormGuide guideId="journal_entry" spanFull />
        <Field label="Remarks">
          <input class={inputClass} value={remarks()} disabled={readOnly()} onInput={(e) => setRemarks(e.currentTarget.value)} />
        </Field>
        <div class="col-span-2 space-y-2">
          <p class="text-sm font-medium text-text-primary">Lines</p>
          <For each={lines()}>
            {(ln, i) => (
              <div class="grid grid-cols-5 gap-2">
                <select
                  class={inputClass}
                  disabled={readOnly()}
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
                  disabled={readOnly()}
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
                  disabled={readOnly()}
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
                  disabled={readOnly()}
                  value={ln.debit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, debit: e.currentTarget.value } : r)))
                  }
                />
                <input
                  class={inputClass}
                  type="number"
                  placeholder="Credit"
                  disabled={readOnly()}
                  value={ln.credit}
                  onInput={(e) =>
                    setLines((rows) => rows.map((r, idx) => (idx === i() ? { ...r, credit: e.currentTarget.value } : r)))
                  }
                />
              </div>
            )}
          </For>
          <Show when={!readOnly()}>
            <button
              type="button"
              class="text-sm text-brand-600 hover:underline"
              onClick={() => setLines((rows) => [...rows, { account_code: "", debit: "", credit: "", dept_id: "", project_id: "" }])}
            >
              + Add line
            </button>
          </Show>
        </div>
      </EntityModal>
    </div>
  );
}
