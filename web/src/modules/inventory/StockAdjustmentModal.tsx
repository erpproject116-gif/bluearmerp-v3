import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalField } from "../../shared/ModalField";
import { CustomFieldsSection, collectCustomFieldErrors } from "../../shared/CustomFieldsSection";
import { useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { submitEntity, collectRequiredFieldErrors, handleSaveResult, showClientValidationBlocker } from "../../shared/handleSaveResult";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { AttachmentsField } from "../../shared/AttachmentsField";
import {
  StockAdjustmentLineGrid,
  emptyStockAdjustmentLine,
  type StockAdjustmentLineRow,
} from "./StockAdjustmentLineGrid";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";

export type StockAdjustmentInitialItem = { id: number; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Prefill one or more item lines (from Items multi-select). */
  initialItems?: StockAdjustmentInitialItem[];
  /** @deprecated Prefer initialItems — kept for single-item callers. */
  initialItemId?: number | null;
  initialItemLabel?: string;
  requestId?: number | null;
};

function linesToPayload(lines: StockAdjustmentLineRow[]) {
  return lines.map((ln) => ({
    item_id: ln.item_id!,
    location_id: ln.location_id!,
    qty_delta: Number(ln.qty_delta),
  }));
}

function resolveInitialItems(props: Props): StockAdjustmentInitialItem[] {
  if (props.initialItems?.length) {
    return props.initialItems.filter((i) => i.id > 0);
  }
  if (props.initialItemId != null && props.initialItemId > 0) {
    return [{ id: props.initialItemId, label: props.initialItemLabel ?? "" }];
  }
  return [];
}

function linesFromInitialItems(items: StockAdjustmentInitialItem[]): StockAdjustmentLineRow[] {
  if (items.length === 0) return [emptyStockAdjustmentLine(1)];
  return items.map((item, i) => ({
    ...emptyStockAdjustmentLine(i + 1),
    item_id: item.id,
    item_label: item.label,
  }));
}

const STOCK_ADJUSTMENT_ENTITY = "inv_stock_adjustment";

export function StockAdjustmentModal(props: Props) {
  const toast = useToast();
  const { byKey, fields } = useFormFieldSettings(STOCK_ADJUSTMENT_ENTITY);
  const [customValues, setCustomValues] = createSignal<Record<string, unknown>>({});
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string | undefined>>({});
  const [lines, setLines] = createSignal<StockAdjustmentLineRow[]>([emptyStockAdjustmentLine(1)]);
  const [reason, setReason] = createSignal("");
  const [draftRequestId, setDraftRequestId] = createSignal<number | null>(null);
  const [requestStatus, setRequestStatus] = createSignal<string | null>(null);
  /** Skip silent draft auto-apply when opening with prefilled items from Items. */
  const [skipDraftAutoApply, setSkipDraftAutoApply] = createSignal(false);
  let lastOpen = false;

  const reset = () => {
    setFieldErrors({});
    setLines([emptyStockAdjustmentLine(1)]);
    setReason("");
    setCustomValues({});
    setDraftRequestId(null);
    setRequestStatus(null);
  };

  createEffect(() => {
    const open = props.open;
    if (!open) {
      lastOpen = false;
      setSkipDraftAutoApply(false);
      return;
    }
    if (lastOpen) return;
    lastOpen = true;

    if (props.requestId) {
      setSkipDraftAutoApply(false);
      reset();
      void loadRequest(props.requestId);
      return;
    }

    const initials = resolveInitialItems(props);
    reset();
    if (initials.length > 0) {
      setSkipDraftAutoApply(true);
      setLines(linesFromInitialItems(initials));
    } else {
      setSkipDraftAutoApply(false);
    }
  });

  const loadRequest = async (id: number) => {
    const res = await apiFetch<{
      id: number;
      reason: string;
      status: string;
      custom_values?: Record<string, unknown>;
      lines?: Array<{
        line_no: number;
        item_id: number;
        item_code: string;
        item_name: string;
        location_id: number;
        location_name: string;
        qty_delta: number;
      }>;
      item_id?: number;
      item_code?: string;
      item_name?: string;
      location_id?: number;
      location_name?: string;
      qty_delta?: number;
    }>(`/api/v1/inventory/stock-adjustment-requests/${id}`);
    if (!res.success || !res.data) return;
    setDraftRequestId(res.data.id);
    setRequestStatus(res.data.status);
    setReason(res.data.reason);
    setCustomValues(res.data.custom_values ?? {});
    const loaded = res.data.lines?.length
      ? res.data.lines.map((ln) => ({
          line_no: ln.line_no,
          item_id: ln.item_id,
          item_label: `${ln.item_code} — ${ln.item_name}`,
          location_id: ln.location_id,
          location_label: ln.location_name,
          qty_delta: String(ln.qty_delta),
        }))
      : res.data.item_id
        ? [
            {
              ...emptyStockAdjustmentLine(1),
              item_id: res.data.item_id,
              item_label: `${res.data.item_code} — ${res.data.item_name}`,
              location_id: res.data.location_id ?? null,
              location_label: res.data.location_name ?? "",
              qty_delta: String(res.data.qty_delta ?? ""),
            },
          ]
        : [emptyStockAdjustmentLine(1)];
    setLines(loaded);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.invStockAdjustment,
    draftKey: "new",
    getPayload: () => ({
      lines: lines(),
      reason: reason(),
      custom_values: customValues(),
      request_id: draftRequestId(),
    }),
    onApply: (payload) => {
      setLines(payload.lines?.length ? payload.lines : [emptyStockAdjustmentLine(1)]);
      setReason(payload.reason);
      setCustomValues(payload.custom_values ?? {});
      if (payload.request_id) setDraftRequestId(payload.request_id);
    },
    enabled: () => props.open && !props.requestId,
    // When opening from Items with prefilled rows, show Restore banner instead of wiping them.
    autoApply: () => props.open && !props.requestId && !skipDraftAutoApply(),
  });

  const validate = () => {
    setFieldErrors({});
    const customDefs = fields()
      .filter((f) => f.kind === "custom" && f.is_active && f.is_visible)
      .map((f) => ({ field_key: f.field_key, label: f.label, is_required: f.is_required }));
    const errors: Record<string, string | undefined> = {
      ...collectRequiredFieldErrors({ reason: reason().trim() }, [{ key: "reason", label: byKey().reason?.label?.trim() || "Reason" }]),
      ...collectCustomFieldErrors(customValues(), customDefs),
    };
    const rowLines = lines();
    for (const ln of rowLines) {
      if (!ln.item_id || !ln.location_id) {
        errors.lines = "Each line needs an item and location.";
        break;
      }
      const qty = Number(ln.qty_delta);
      if (!ln.qty_delta || qty === 0 || Number.isNaN(qty)) {
        errors.lines = "Each line needs a non-zero quantity change.";
        break;
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      showClientValidationBlocker(errors, toast);
      return false;
    }
    return true;
  };

  const buildBody = () => {
    const rowLines = lines();
    const payloadLines = linesToPayload(rowLines);
    const body: Record<string, unknown> = {
      reason: reason().trim(),
      lines: payloadLines,
      custom_values: customValues(),
    };
    if (payloadLines.length === 1) {
      body.item_id = payloadLines[0].item_id;
      body.location_id = payloadLines[0].location_id;
      body.qty_delta = payloadLines[0].qty_delta;
    }
    if (draftRequestId()) body.id = draftRequestId();
    return body;
  };

  const submitForApproval = async () => {
    if (!validate()) return;
    setSaving(true);

    if (draftRequestId() && requestStatus() === "draft") {
      const saved = await apiFetch<{ id: number }>(
        "/api/v1/inventory/stock-adjustments/draft",
        { method: "POST", body: JSON.stringify(buildBody()) },
        { silent: true },
      );
      if (!saved.success) {
        setSaving(false);
        handleSaveResult(saved, toast, "Draft saved.", { onFieldErrors: setFieldErrors });
        return;
      }
      const ok = await submitEntity(
        () =>
          apiFetch(`/api/v1/inventory/stock-adjustment-requests/${draftRequestId()}/submit`, {
            method: "POST",
            body: JSON.stringify({ remarks: reason().trim() }),
          }, { silent: true }),
        toast,
        "Sent for approval. Inventory updates only after an approver confirms.",
        { onFieldErrors: setFieldErrors },
      );
      setSaving(false);
      if (!ok) return;
      await draft.clearOnSave();
      reset();
      props.onSaved();
      props.onClose();
      return;
    }

    const ok = await submitEntity(
      () =>
        apiFetch("/api/v1/inventory/stock-adjustments", {
          method: "POST",
          body: JSON.stringify(buildBody()),
        }, { silent: true }),
      toast,
      "Sent for approval. Inventory updates only after an approver confirms.",
      { onFieldErrors: setFieldErrors },
    );
    setSaving(false);
    if (!ok) return;
    await draft.clearOnSave();
    reset();
    props.onSaved();
    props.onClose();
  };

  const saveDraftThenClose = async () => {
    if (!validate()) return;
    setSaving(true);
    const res = await apiFetch<{ id: number; status: string }>(
      "/api/v1/inventory/stock-adjustments/draft",
      { method: "POST", body: JSON.stringify(buildBody()) },
      { silent: true },
    );
    setSaving(false);
    if (!res.success) {
      handleSaveResult(res, toast, "Draft saved.", { onFieldErrors: setFieldErrors });
      return;
    }
    if (res.data?.id) setDraftRequestId(res.data.id);
    setRequestStatus("draft");
    await draft.clearOnSave();
    toast.success("Draft saved. Stock is unchanged until submitted and approved.");
    props.onSaved();
    props.onClose();
  };

  const readOnly = () => requestStatus() != null && requestStatus() !== "draft";

  return (
    <EntityModal
      open={props.open}
      title="Stock adjustment"
      onClose={() => {
        reset();
        props.onClose();
      }}
      onSave={() => {
        if (readOnly()) {
          reset();
          props.onClose();
          return;
        }
        void submitForApproval();
      }}
      onSecondarySave={readOnly() ? undefined : () => void saveDraftThenClose()}
      secondarySaveLabel="Save draft"
      saveLabel={readOnly() ? "Close" : "Submit for approval"}
      saving={saving()}
      headerActions={
        <RecordHistoryButton
          variant="button"
          targetType="inv_stock_adjustment_request"
          targetId={props.requestId}
          title={props.requestId ? `History — adjustment #${props.requestId}` : "History"}
        />
      }
    >
      <draft.DraftBanner />
      <ModalFormGuide guideId="stock_adjustment" spanFull />
      <FormErrorSummary errors={fieldErrors} />
      <p class="col-span-full text-sm text-text-secondary">
        Document with one or more item/location lines. Quantity on hand does not change until a store admin or owner
        approves.
      </p>
      <Show when={requestStatus()}>
        <p class="col-span-full text-sm text-text-secondary">
          Status: <span class="font-medium text-text-primary">{requestStatus()}</span>
        </p>
      </Show>
      <ModalField settings={byKey} fieldKey="reason" fallbackLabel="Reason" fallbackRequired span="full" errors={fieldErrors}>
        {(m) => (
          <textarea
            class={inputClass}
            rows={2}
            value={reason()}
            disabled={readOnly() || m.disabled}
            placeholder={m.placeholder}
            onInput={(e) => {
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next.reason;
                return next;
              });
              setReason(e.currentTarget.value);
            }}
            {...m.inputProps}
          />
        )}
      </ModalField>
      <Show when={fieldErrors().lines}>
        <p class="col-span-full text-sm text-red-700" role="alert">
          {fieldErrors().lines}
        </p>
      </Show>
      <StockAdjustmentLineGrid lines={lines} onChange={setLines} disabled={readOnly()} settings={byKey} />
      <div class="col-span-full">
        <CustomFieldsSection
          entityType={STOCK_ADJUSTMENT_ENTITY}
          values={customValues}
          onChange={(key, value) => setCustomValues((prev) => ({ ...prev, [key]: value }))}
        />
      </div>
      <Show when={draftRequestId()}>
        <div class="col-span-full">
          <AttachmentsField
            scope="inventory/stock-adjustment-requests"
            formOpen={props.open}
            docId={draftRequestId() ?? undefined}
            label="Supporting documents"
          />
        </div>
      </Show>
    </EntityModal>
  );
}
