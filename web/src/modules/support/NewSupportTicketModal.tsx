import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import {
  createTicket,
  useInvalidateSupportTickets,
  type TicketPriority,
} from "../../shared/useSupportTickets";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { fetchPartners, fetchRepairOrders, fetchSupportUsers, fetchWarrantyAssets } from "./supportLookups";

const PRIORITY_OPTIONS: TicketPriority[] = ["low", "normal", "high", "urgent"];
const CATEGORY_OPTIONS = ["general", "warranty", "billing", "technical", "returns"];

type Props = {
  open: boolean;
  onClose: () => void;
  /** When true, navigate to the new ticket after create. */
  navigateOnCreate?: boolean;
};

export function NewSupportTicketModal(props: Props) {
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateSupportTickets();

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

  const reset = () => {
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
    enabled: () => props.open,
    autoApply: () => props.open,
  });

  const close = () => {
    props.onClose();
  };

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
    reset();
    close();
    invalidate();
    toast.success("Support ticket created.");
    if (props.navigateOnCreate !== false && res.data?.id) {
      navigate(`/app/support/tickets/${res.data.id}`);
    }
  };

  return (
    <EntityModal
      open={props.open}
      title="New support ticket"
      saving={saving()}
      onClose={close}
      onSave={() => void save()}
    >
      <Show when={props.open}>
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
      </Show>
    </EntityModal>
  );
}
