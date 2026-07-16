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
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({});

  const fieldError = (key: string) => fieldErrors()[key];

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
    setFieldErrors({});
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
    setFieldErrors({});
    if (!subject().trim()) {
      setFieldErrors({ subject: "Subject is required." });
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
      if (res.errors && Object.keys(res.errors).length > 0) {
        setFieldErrors(res.errors);
      }
      const fieldMsg = res.errors ? Object.values(res.errors).filter(Boolean).join(" · ") : "";
      if (!res.errors || Object.keys(res.errors).length === 0) {
        toast.warning(res.message || "Could not create ticket.");
      } else if (fieldMsg) {
        toast.warning(fieldMsg);
      }
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
            <input
              class={inputClass}
              value={subject()}
              onInput={(e) => {
                setSubject(e.currentTarget.value);
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.subject;
                  return next;
                });
              }}
            />
            <Show when={fieldError("subject")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("subject")}</p>
            </Show>
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
            <Show when={fieldError("description")}>
              <p class="mt-1 text-xs text-red-600">{fieldError("description")}</p>
            </Show>
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
