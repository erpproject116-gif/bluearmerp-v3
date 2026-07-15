import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import {
  convertLeadToQuotation,
  createLead,
  patchLead,
  useInvalidateLeads,
  useLeads,
  type Lead,
  type LeadStatus,
} from "../../shared/useCrmLeads";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { CrmLayout } from "./CrmLayout";

const STATUS_OPTIONS: LeadStatus[] = ["new", "contacted", "qualified", "lost", "converted"];

export default function LeadsPage() {
  const navigate = useNavigate();
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("updated_at");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [selected, setSelected] = createSignal<Lead | null>(null);
  const [leadName, setLeadName] = createSignal("");
  const [companyName, setCompanyName] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [phone, setPhone] = createSignal("");
  const [status, setStatus] = createSignal<LeadStatus>("new");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateLeads();

  const list = useLeads(() => ({ page: page(), pageSize, q: q() || undefined }));

  const openNew = () => {
    setSelected(null);
    setLeadName("");
    setCompanyName("");
    setEmail("");
    setPhone("");
    setStatus("new");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (row: Lead) => {
    setSelected(row);
    setLeadName(row.lead_name);
    setCompanyName(row.company_name ?? "");
    setEmail(row.email ?? "");
    setPhone(row.phone ?? "");
    setStatus(row.status);
    setNotes(row.notes ?? "");
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.crmLead,
    draftKey: () => (selected() ? `edit-${selected()!.id}` : "new"),
    getPayload: () => ({
      lead_name: leadName(),
      company_name: companyName(),
      email: email(),
      phone: phone(),
      status: status(),
      notes: notes(),
    }),
    onApply: (payload) => {
      setLeadName(payload.lead_name);
      setCompanyName(payload.company_name);
      setEmail(payload.email);
      setPhone(payload.phone);
      setStatus(payload.status);
      setNotes(payload.notes);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !selected(),
  });

  const save = async () => {
    if (!leadName().trim()) {
      toast.warning("Lead name is required.");
      return;
    }
    setSaving(true);
    const body = {
      lead_name: leadName().trim(),
      company_name: companyName().trim() || undefined,
      email: email().trim() || undefined,
      phone: phone().trim() || undefined,
      status: status(),
      notes: notes().trim() || undefined,
      source: "manual",
    };
    const row = selected();
    const res = row ? await patchLead(row.id, body) : await createLead(body);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save lead.");
      return;
    }
    await draft.clearOnSave();
    setModalOpen(false);
    invalidate();
  };

  const convert = async (row: Lead) => {
    const res = await convertLeadToQuotation(row.id);
    if (!res.success) {
      toast.warning(res.message ?? "Convert failed.");
      return;
    }
    invalidate();
    toast.success(res.data?.message ?? "Lead converted.");
    const target = res.data?.redirect_to ?? "/app/quotation/quotations";
    navigate(target);
  };

  return (
    <CrmLayout>
      <SpreadsheetGrid
        columns={[
          { key: "lead_name", header: "Lead", clickable: true },
          { key: "company_name", header: "Company" },
          { key: "email", header: "Email" },
          { key: "phone", header: "Phone" },
          { key: "status", header: "Status" },
          { key: "pic_name", header: "PIC" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-xs text-brand-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  void convert(r);
                }}
              >
                To quote
              </button>
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="lead_name"
        nameKey="company_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search leads…"
      />

      <EntityModal
        open={modalOpen()}
        title={selected() ? "Edit lead" : "New lead"}
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <draft.DraftBanner />
        <Field label="Lead name">
          <input class={inputClass} value={leadName()} onInput={(e) => setLeadName(e.currentTarget.value)} />
        </Field>
        <Field label="Company">
          <input class={inputClass} value={companyName()} onInput={(e) => setCompanyName(e.currentTarget.value)} />
        </Field>
        <Field label="Email">
          <input class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </Field>
        <Field label="Phone">
          <input class={inputClass} value={phone()} onInput={(e) => setPhone(e.currentTarget.value)} />
        </Field>
        <Field label="Status">
          <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value as LeadStatus)}>
            <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s}</option>}</For>
          </select>
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <Show when={selected()}>
          <p class="text-xs text-slate-500">Use “To quote” on the grid to generate a draft quotation from this lead.</p>
        </Show>
      </EntityModal>
    </CrmLayout>
  );
}
