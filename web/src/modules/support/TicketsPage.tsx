import { createSignal, For } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import {
  createTicket,
  useInvalidateSupportTickets,
  useSupportTickets,
  type Ticket,
  type TicketPriority,
  type TicketStatus,
} from "../../shared/useSupportTickets";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { SupportLayout } from "./SupportLayout";
import { fetchPartners, fetchRepairOrders, fetchSupportUsers, fetchWarrantyAssets } from "./supportLookups";

const STATUS_OPTIONS: TicketStatus[] = ["open", "in_progress", "waiting", "resolved", "closed"];
const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];
const CATEGORY_OPTIONS = ["general", "warranty", "billing", "technical", "returns"];

export default function TicketsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const canCreate = () => hasPermission(auth.me, "support.tickets_new", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } =
    useListState("ticket_date", 25, { defaultStatus: "", defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [subject, setSubject] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [partnerLabel, setPartnerLabel] = createSignal("");
  const [warrantyId, setWarrantyId] = createSignal<number | null>(null);
  const [warrantyLabel, setWarrantyLabel] = createSignal("");
  const [assigneeId, setAssigneeId] = createSignal<number | null>(null);
  const [assigneeLabel, setAssigneeLabel] = createSignal("");
  const [repairOrderId, setRepairOrderId] = createSignal<number | null>(null);
  const [repairOrderLabel, setRepairOrderLabel] = createSignal("");
  const [category, setCategory] = createSignal("general");
  const [priority, setPriority] = createSignal<TicketPriority>("normal");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateSupportTickets();

  const list = useSupportTickets(() => ({
    page: page(),
    pageSize,
    q: q() || undefined,
    status: statusFilter() || undefined,
    sort: sort(),
    order: order(),
  }));

  const openNew = () => {
    setSubject("");
    setDescription("");
    setPartnerId(null);
    setPartnerLabel("");
    setWarrantyId(null);
    setWarrantyLabel("");
    setAssigneeId(null);
    setAssigneeLabel("");
    setRepairOrderId(null);
    setRepairOrderLabel("");
    setCategory("general");
    setPriority("normal");
    setModalOpen(true);
  };

  const openDetail = (row: Ticket) => {
    navigate(`/app/support/tickets/${row.id}`);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.supportTicket,
    draftKey: "new",
    getPayload: () => ({
      subject: subject(),
      description: description(),
      partner_id: partnerId(),
      partner_label: partnerLabel(),
      warranty_id: warrantyId(),
      warranty_label: warrantyLabel(),
      assignee_id: assigneeId(),
      assignee_label: assigneeLabel(),
      repair_order_id: repairOrderId(),
      repair_order_label: repairOrderLabel(),
      category: category(),
      priority: priority(),
    }),
    onApply: (payload) => {
      setSubject(payload.subject);
      setDescription(payload.description);
      setPartnerId(payload.partner_id);
      setPartnerLabel(payload.partner_label);
      setWarrantyId(payload.warranty_id);
      setWarrantyLabel(payload.warranty_label);
      setAssigneeId(payload.assignee_id);
      setAssigneeLabel(payload.assignee_label);
      setRepairOrderId(payload.repair_order_id);
      setRepairOrderLabel(payload.repair_order_label);
      setCategory(payload.category);
      setPriority(payload.priority);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen(),
  });

  const save = async () => {
    if (!subject().trim()) {
      toast.warning("Subject is required.");
      return;
    }
    if (!partnerId()) {
      toast.warning("Customer is required.");
      return;
    }
    setSaving(true);
    const res = await createTicket({
      subject: subject().trim(),
      description: description().trim() || undefined,
      partner_id: partnerId()!,
      warranty_asset_id: warrantyId(),
      repair_order_id: repairOrderId(),
      assigned_user_id: assigneeId(),
      category: category(),
      priority: priority(),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not create ticket.");
      return;
    }
    await draft.clearOnSave();
    setModalOpen(false);
    invalidate();
    if (res.data?.id) navigate(`/app/support/tickets/${res.data.id}`);
  };

  return (
    <SupportLayout>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="text-sm text-text-secondary">
          Status
          <select
            class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
          >
            <option value="">All</option>
            <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
          </select>
        </label>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "ticket_no", header: "Ticket #", clickable: true },
          { key: "ticket_date", header: "Date" },
          { key: "subject", header: "Subject" },
          { key: "partner_name", header: "Customer" },
          { key: "category", header: "Category" },
          { key: "priority", header: "Priority" },
          { key: "status", header: "Status" },
          { key: "assigned_name", header: "Assigned" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openDetail}
        onNew={openNew}
        showNew={canCreate()}
        codeKey="ticket_no"
        nameKey="subject"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search tickets…"
      />

      <EntityModal
        open={modalOpen()}
        title="New support ticket"
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <draft.DraftBanner />
        <Field label="Subject">
          <input class={inputClass} value={subject()} onInput={(e) => setSubject(e.currentTarget.value)} />
        </Field>
        <LookupCombo
          label="Customer"
          required
          value={() => partnerLabel()}
          selectedId={() => partnerId()}
          onInput={setPartnerLabel}
          onSelect={(o) => {
            setPartnerId(o.id);
            setPartnerLabel(o.label);
            setWarrantyId(null);
            setWarrantyLabel("");
          }}
          onClear={() => {
            setPartnerId(null);
            setPartnerLabel("");
            setWarrantyId(null);
            setWarrantyLabel("");
          }}
          fetchOptions={fetchPartners}
        />
        <LookupCombo
          label="Warranty asset (optional)"
          value={() => warrantyLabel()}
          selectedId={() => warrantyId()}
          onInput={setWarrantyLabel}
          onSelect={(o) => {
            setWarrantyId(o.id);
            setWarrantyLabel(o.label);
          }}
          onClear={() => {
            setWarrantyId(null);
            setWarrantyLabel("");
          }}
          fetchOptions={(query) => fetchWarrantyAssets(query, partnerId())}
        />
        <LookupCombo
          label="Assign to (optional)"
          value={() => assigneeLabel()}
          selectedId={() => assigneeId()}
          onInput={setAssigneeLabel}
          onSelect={(o) => {
            setAssigneeId(o.id);
            setAssigneeLabel(o.label);
          }}
          onClear={() => {
            setAssigneeId(null);
            setAssigneeLabel("");
          }}
          fetchOptions={fetchSupportUsers}
        />
        <LookupCombo
          label="Repair order (optional)"
          value={() => repairOrderLabel()}
          selectedId={() => repairOrderId()}
          onInput={setRepairOrderLabel}
          onSelect={(o) => {
            setRepairOrderId(o.id);
            setRepairOrderLabel(o.label);
          }}
          onClear={() => {
            setRepairOrderId(null);
            setRepairOrderLabel("");
          }}
          fetchOptions={(query) => fetchRepairOrders(query, partnerId())}
        />
        <Field label="Category">
          <select class={inputClass} value={category()} onChange={(e) => setCategory(e.currentTarget.value)}>
            <For each={CATEGORY_OPTIONS}>{(c) => <option value={c}>{c}</option>}</For>
          </select>
        </Field>
        <Field label="Priority">
          <select
            class={inputClass}
            value={priority()}
            onChange={(e) => setPriority(e.currentTarget.value as TicketPriority)}
          >
            <For each={PRIORITY_OPTIONS}>{(p) => <option value={p}>{p}</option>}</For>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            class={inputClass}
            rows={4}
            value={description()}
            onInput={(e) => setDescription(e.currentTarget.value)}
          />
        </Field>
      </EntityModal>
    </SupportLayout>
  );
}
