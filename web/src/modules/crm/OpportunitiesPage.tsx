import { createSignal, For } from "solid-js";
import { DateInput } from "../../shared/DateInput";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import {
  createOpportunity,
  patchOpportunity,
  useInvalidateOpportunities,
  useOpportunities,
  type Opportunity,
  type OpportunityStage,
} from "../../shared/useCrmLeads";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { CrmLayout } from "./CrmLayout";

const STAGE_OPTIONS: OpportunityStage[] = [
  "prospect",
  "qualification",
  "proposal",
  "negotiation",
  "won",
  "lost",
];

export default function OpportunitiesPage() {
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, setPageSize } = useListState("expected_close_date");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [selected, setSelected] = createSignal<Opportunity | null>(null);
  const [title, setTitle] = createSignal("");
  const [stage, setStage] = createSignal<OpportunityStage>("prospect");
  const [expectedValue, setExpectedValue] = createSignal("");
  const [expectedClose, setExpectedClose] = createSignal("");
  const [probability, setProbability] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateOpportunities();

  const list = useOpportunities(() => ({ page: page(), pageSize: pageSize(), q: q() || undefined }));

  const openNew = () => {
    setSelected(null);
    setTitle("");
    setStage("prospect");
    setExpectedValue("");
    setExpectedClose("");
    setProbability("");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (row: Opportunity) => {
    setSelected(row);
    setTitle(row.title);
    setStage(row.stage);
    setExpectedValue(row.expected_value != null ? String(row.expected_value) : "");
    setExpectedClose(row.expected_close_date ?? "");
    setProbability(row.probability != null ? String(row.probability) : "");
    setNotes(row.notes ?? "");
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.crmOpportunity,
    draftKey: () => (selected() ? `edit-${selected()!.id}` : "new"),
    getPayload: () => ({
      title: title(),
      stage: stage(),
      expected_value: expectedValue(),
      expected_close_date: expectedClose(),
      probability: probability(),
      notes: notes(),
    }),
    onApply: (payload) => {
      setTitle(payload.title);
      setStage(payload.stage);
      setExpectedValue(payload.expected_value);
      setExpectedClose(payload.expected_close_date);
      setProbability(payload.probability);
      setNotes(payload.notes);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !selected(),
  });

  const save = async () => {
    if (!title().trim()) {
      toast.warning("Title is required.");
      return;
    }
    setSaving(true);
    const body = {
      title: title().trim(),
      stage: stage(),
      expected_value: expectedValue() ? Number(expectedValue()) : undefined,
      expected_close_date: expectedClose() || undefined,
      probability: probability() ? Number(probability()) : undefined,
      notes: notes().trim() || undefined,
    };
    const row = selected();
    const res = row ? await patchOpportunity(row.id, body) : await createOpportunity(body);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save opportunity.");
      return;
    }
    await draft.clearOnSave();
    setModalOpen(false);
    invalidate();
  };

  return (
    <CrmLayout>
      <SpreadsheetGrid
        columns={[
          { key: "title", header: "Opportunity", clickable: true },
          { key: "stage", header: "Stage" },
          { key: "lead_name", header: "Lead", render: (r) => r.lead_name || "—" },
          { key: "partner_name", header: "Customer", render: (r) => r.partner_name || "—" },
          { key: "expected_value", header: "Value", render: (r) => String(r.expected_value ?? "—") },
          { key: "expected_close_date", header: "Close date", render: (r) => r.expected_close_date ?? "—" },
          { key: "probability", header: "%", render: (r) => (r.probability != null ? `${r.probability}%` : "—") },
          { key: "pic_name", header: "PIC" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="title"
        nameKey="stage"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search opportunities…"
      />

      <EntityModal
        open={modalOpen()}
        title={selected() ? "Edit opportunity" : "New opportunity"}
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <draft.DraftBanner />
        <Field label="Title">
          <input class={inputClass} value={title()} onInput={(e) => setTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Stage">
          <select class={inputClass} value={stage()} onChange={(e) => setStage(e.currentTarget.value as OpportunityStage)}>
            <For each={STAGE_OPTIONS}>{(s) => <option value={s}>{s}</option>}</For>
          </select>
        </Field>
        <Field label="Expected value">
          <input
            type="number"
            class={inputClass}
            value={expectedValue()}
            onInput={(e) => setExpectedValue(e.currentTarget.value)}
          />
        </Field>
        <Field label="Expected close">
          <DateInput value={expectedClose()} onInput={(e) => setExpectedClose(e.currentTarget.value)} />
        </Field>
        <Field label="Probability %">
          <input
            type="number"
            min={0}
            max={100}
            class={inputClass}
            value={probability()}
            onInput={(e) => setProbability(e.currentTarget.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </CrmLayout>
  );
}
