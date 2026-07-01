import { createSignal } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../shared/api";
import { QualityLayout } from "./QualityLayout";

type Ncr = {
  id: number;
  ncr_no: string;
  ncr_date: string;
  title: string;
  severity: string;
  status: string;
  item_name?: string;
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_review", label: "In review" },
  { value: "closed", label: "Closed" },
];

const SEVERITY_OPTIONS = ["minor", "major", "critical"];

export default function NcrsPage() {
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("ncr_date", 25, { defaultOrder: "desc", defaultStatus: "" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [severity, setSeverity] = createSignal("minor");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize),
      sort: sort(),
      order: order(),
    });
    if (q()) qs.set("q", q());
    if (statusFilter()) qs.set("status", statusFilter());
    return {
      queryKey: ["qms-ncrs", page(), pageSize, sort(), order(), q(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<Ncr[]>(`/api/v1/quality/ncrs?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["qms-ncrs"] });

  const openNew = () => {
    setTitle("");
    setDescription("");
    setSeverity("minor");
    setModalOpen(true);
  };

  const save = async () => {
    if (!title().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/quality/ncrs", {
      method: "POST",
      body: JSON.stringify({
        title: title().trim(),
        description: description().trim() || undefined,
        severity: severity(),
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create NCR.");
      return;
    }
    toast.success("NCR created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <QualityLayout>
      <SpreadsheetGrid<Ncr>
        columns={[
          { key: "ncr_no", header: "NCR no.", clickable: true },
          { key: "ncr_date", header: "Date" },
          { key: "title", header: "Title", clickable: true },
          { key: "severity", header: "Severity", sortable: false, render: (r) => <span class="capitalize">{r.severity}</span> },
          { key: "status", header: "Status", sortable: false, render: (r) => <span class="capitalize">{r.status.replace(/_/g, " ")}</span> },
          { key: "item_name", header: "Item" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        settingsHref="/app/quality/ncrs"
        codeKey="ncr_no"
        nameKey="title"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search NCR no. or title…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title="New NCR"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Title *">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Description">
          <textarea class={inputClass} rows={3} value={description()} onInput={(e) => setDescription(e.currentTarget.value)} />
        </Field>
        <Field label="Severity">
          <select class={inputClass} value={severity()} onChange={(e) => setSeverity(e.currentTarget.value)}>
            {SEVERITY_OPTIONS.map((s) => (
              <option value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </Field>
      </EntityModal>
    </QualityLayout>
  );
}
