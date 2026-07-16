import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { LookupCombo } from "../../shared/LookupCombo";
import { AttachmentsField } from "../../shared/AttachmentsField";
import { QuickCustomerModal } from "../../shared/QuickCustomerModal";
import { createTicket, useInvalidateSupportTickets } from "../../shared/useSupportTickets";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { fetchPartners, fetchRepairOrders, fetchWarrantyAssets } from "./supportLookups";

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
  const [repairOrderId, setRepairOrderId] = createSignal<number | null>(null);
  const [repairOrderLabel, setRepairOrderLabel] = createSignal("");
  const [category, setCategory] = createSignal("general");
  const [createdTicketId, setCreatedTicketId] = createSignal<number | undefined>(undefined);
  const [attachmentCount, setAttachmentCount] = createSignal(0);
  const [saving, setSaving] = createSignal(false);
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [newCustomerName, setNewCustomerName] = createSignal("");

  const reset = () => {
    setSubject("");
    setDescription("");
    setPartnerId(null);
    setPartnerLabel("");
    setWarrantyId(null);
    setWarrantyLabel("");
    setRepairOrderId(null);
    setRepairOrderLabel("");
    setCategory("general");
    setCreatedTicketId(undefined);
    setAttachmentCount(0);
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
      repair_order_id: repairOrderId(),
      repair_order_label: repairOrderLabel(),
      category: category(),
    }),
    onApply: (payload) => {
      setSubject(payload.subject);
      setDescription(payload.description);
      setPartnerId(payload.partner_id);
      setPartnerLabel(payload.partner_label);
      setWarrantyId(payload.warranty_id);
      setWarrantyLabel(payload.warranty_label);
      setRepairOrderId(payload.repair_order_id);
      setRepairOrderLabel(payload.repair_order_label);
      setCategory(payload.category);
    },
    enabled: () => props.open,
    autoApply: () => props.open,
  });

  const close = () => {
    reset();
    props.onClose();
  };

  const save = async () => {
    if (!subject().trim()) {
      toast.warning("Subject is required.");
      return;
    }
    setSaving(true);
    const res = await createTicket({
      subject: subject().trim(),
      description: description().trim() || undefined,
      partner_id: partnerId() ?? null,
      warranty_asset_id: warrantyId(),
      repair_order_id: repairOrderId(),
      category: category(),
      priority: "normal",
    });
    setSaving(false);
    if (!res.success || !res.data) {
      const fieldErrors = res.errors ? Object.values(res.errors).filter(Boolean).join(" · ") : "";
      toast.warning(fieldErrors || res.message || "Could not create ticket.");
      return;
    }
    // Keep modal open briefly so AttachmentsField can flush staged files to the new id.
    setCreatedTicketId(res.data.id);
    await draft.clearOnSave();
    invalidate();
    toast.success("Support ticket created.");
    const ticketId = res.data.id;
    // Allow pending uploads to flush via AttachmentsField's docId effect, then close.
    window.setTimeout(() => {
      reset();
      props.onClose();
      if (props.navigateOnCreate !== false) {
        navigate(`/app/support/tickets/${ticketId}`);
      }
    }, attachmentCount() > 0 ? 600 : 0);
  };

  return (
    <>
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
            label="Customer (optional)"
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
            createLabel="Add customer"
            onCreate={(q) => {
              setNewCustomerName(q);
              setShowNewCustomer(true);
            }}
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
          <AttachmentsField
            scope="support/tickets"
            formOpen={props.open}
            docId={createdTicketId()}
            label="Attachments"
            emptyUnsavedHint="Files upload after you save the ticket."
            onCountChange={setAttachmentCount}
          />
          <Field label="Description" span="full">
            <textarea
              class={inputClass}
              rows={6}
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
            />
          </Field>
        </Show>
      </EntityModal>

      <QuickCustomerModal
        open={showNewCustomer()}
        initialName={newCustomerName()}
        onClose={() => setShowNewCustomer(false)}
        onCreated={(p) => {
          setPartnerId(p.id);
          setPartnerLabel(p.company_name);
          setWarrantyId(null);
          setWarrantyLabel("");
        }}
      />
    </>
  );
}
