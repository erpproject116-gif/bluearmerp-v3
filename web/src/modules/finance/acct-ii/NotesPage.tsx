import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { AcctIILayout } from "./AcctIILayout";

type Note = {
  id: number;
  note_type: string;
  note_no: string;
  partner_id: number;
  issue_date: string;
  due_date: string;
  amount: number;
  status: string;
};

type Partner = {
  id: number;
  partner_code: string;
  company_name: string;
};

export default function NotesPage() {
  const [filter, setFilter] = createSignal<"all" | "receivable" | "payable">("all");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [noteType, setNoteType] = createSignal("receivable");
  const [noteNo, setNoteNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal("");
  const [issueDate, setIssueDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["finance-notes"],
    queryFn: async () => {
      const res = await apiFetch<Note[]>("/api/v1/finance/notes");
      if (!res.success) throw new Error(res.message ?? "Failed to load notes");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const partners = createQuery(() => ({
    queryKey: ["partners-mini-notes"],
    queryFn: async () => {
      const res = await apiFetch<Partner[]>("/api/v1/inventory/partners?page=1&pageSize=200&sort=company_name&order=asc");
      if (!res.success) return [];
      return res.data ?? [];
    },
  }));

  const partnerName = (id: number) => {
    const p = (partners.data ?? []).find((x) => x.id === id);
    return p ? `${p.partner_code} — ${p.company_name}` : `#${id}`;
  };

  const filteredRows = () => {
    const rows = list.data?.rows ?? [];
    const f = filter();
    if (f === "all") return rows;
    return rows.filter((r) => r.note_type === f);
  };

  const invalidate = () => void client.invalidateQueries({ queryKey: ["finance-notes"] });

  const openNew = () => {
    setNoteType("receivable");
    setNoteNo("");
    setPartnerId("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDueDate(new Date().toISOString().slice(0, 10));
    setAmount("");
    setModalOpen(true);
  };

  const save = async () => {
    const pid = Number(partnerId());
    if (!noteNo().trim() || !pid) {
      toast.warning("Note number and partner are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<Note>("/api/v1/finance/notes", {
      method: "POST",
      body: JSON.stringify({
        note_type: noteType(),
        note_no: noteNo().trim(),
        partner_id: pid,
        issue_date: issueDate(),
        due_date: dueDate(),
        amount: Number(amount()) || 0,
        status: "open",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create note.");
      return;
    }
    toast.success("Note created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Notes receivable / payable</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Acct. II — promissory notes and other non-invoice receivables or payables with due dates.
        </p>
        <div class="mt-3 flex gap-2">
          {(["all", "receivable", "payable"] as const).map((f) => (
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-sm font-medium capitalize"
              classList={{
                "bg-brand-50 text-brand-600": filter() === f,
                "border border-stroke text-text-secondary": filter() !== f,
              }}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f}
            </button>
          ))}
        </div>
      </section>
      <SpreadsheetGrid<Note>
        columns={[
          { key: "note_no", header: "Note #", clickable: true },
          {
            key: "note_type",
            header: "Type",
            render: (r) => <span class="capitalize">{r.note_type}</span>,
          },
          {
            key: "partner_id",
            header: "Partner",
            render: (r) => partnerName(r.partner_id),
          },
          { key: "issue_date", header: "Issue date" },
          { key: "due_date", header: "Due date" },
          {
            key: "amount",
            header: "Amount",
            render: (r) => r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
        ]}
        rows={filteredRows()}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        codeKey="note_no"
        nameKey="note_type"
        total={filteredRows().length}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />
      <EntityModal
        open={modalOpen()}
        title="New note"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Type">
          <select class={inputClass} value={noteType()} onChange={(e) => setNoteType(e.currentTarget.value)}>
            <option value="receivable">Receivable</option>
            <option value="payable">Payable</option>
          </select>
        </Field>
        <Field label="Note number *">
          <input class={inputClass} value={noteNo()} onInput={(e) => setNoteNo(e.currentTarget.value)} />
        </Field>
        <Field label="Partner *">
          <select class={inputClass} value={partnerId()} onChange={(e) => setPartnerId(e.currentTarget.value)}>
            <option value="">Select partner…</option>
            {(partners.data ?? []).map((p) => (
              <option value={String(p.id)}>
                {p.partner_code} — {p.company_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue date">
          <input class={inputClass} type="date" value={issueDate()} onInput={(e) => setIssueDate(e.currentTarget.value)} />
        </Field>
        <Field label="Due date">
          <input class={inputClass} type="date" value={dueDate()} onInput={(e) => setDueDate(e.currentTarget.value)} />
        </Field>
        <Field label="Amount">
          <input class={inputClass} type="number" min="0" step="0.01" value={amount()} onInput={(e) => setAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
