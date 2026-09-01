import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { submitEntity, collectRequiredFieldErrors, handleSaveResult } from "../../shared/handleSaveResult";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { AttachmentsField } from "../../shared/AttachmentsField";
import {
  StockAdjustmentLineGrid,
  emptyStockAdjustmentLine,
  type StockAdjustmentLineRow,
} from "./StockAdjustmentLineGrid";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
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

export function StockAdjustmentModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string | undefined>>({});
  const [lines, setLines] = createSignal<StockAdjustmentLineRow[]>([emptyStockAdjustmentLine(1)]);
  const [reason, setReason] = createSignal("");
  const [draftRequestId, setDraftRequestId] = createSignal<number | null>(null);
  const [requestStatus, setRequestStatus] = createSignal<string | null>(null);

  const reset = () => {
    setFieldErrors({});
    setLines([emptyStockAdjustmentLine(1)]);
    setReason("");
    setDraftRequestId(null);
    setRequestStatus(null);
  };

  createEffect(() => {
    if (!props.open) return;
    if (props.initialItemId && !props.requestId) {
      setLines([
        {
          ...emptyStockAdjustmentLine(1),
          item_id: props.initialItemId,
          item_label: props.initialItemLabel ?? "",
        },
      ]);
    }
    if (props.requestId) {
      void loadRequest(props.requestId);
    }
  });

  const loadRequest = async (id: number) => {
    const res = await apiFetch<{
      id: number;
      reason: string;
      status: string;
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
      request_id: draftRequestId(),
    }),
    onApply: (payload) => {
      setLines(payload.lines?.length ? payload.lines : [emptyStockAdjustmentLine(1)]);
      setReason(payload.reason);
      if (payload.request_id) setDraftRequestId(payload.request_id);
    },
    enabled: () => props.open && !props.requestId,
    autoApply: () => props.open && !props.requestId,
  });

  const validate = () => {
    setFieldErrors({});
    const errors: Record<string, string | undefined> = {
      ...collectRequiredFieldErrors({ reason: reason().trim() }, [{ key: "reason", label: "Reason" }]),
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
      toast.warning(Object.values(errors).find(Boolean) ?? "Check the highlighted fields.");
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
      onSave={() => void submitForApproval()}
      onSecondarySave={readOnly() ? undefined : () => void saveDraftThenClose()}
      secondarySaveLabel="Save draft"
      saveLabel="Submit for approval"
      saving={saving()}
    >
      <draft.DraftBanner />
      <ModalFormGuide guideId="stock_adjustment" spanFull />
      <FormErrorSummary errors={fieldErrors} />
      <p class="col-span-full text-sm text-text-secondary">
        Document with one or more item/location lines. Quantity on hand does not change until a store admin or owner approves.
      </p>
      <Show when={requestStatus()}>
        <p class="col-span-full text-sm text-text-secondary">
          Status: <span class="font-medium text-text-primary">{requestStatus()}</span>
        </p>
      </Show>
      <Field label="Reason *" span="full" error={fieldErrors().reason}>
        <textarea
          class={inputClass}
          rows={2}
          value={reason()}
          disabled={readOnly()}
          onInput={(e) => {
            setFieldErrors((prev) => {
              const next = { ...prev };
              delete next.reason;
              return next;
            });
            setReason(e.currentTarget.value);
          }}
        />
      </Field>
      <Show when={fieldErrors().lines}>
        <p class="col-span-full text-sm text-red-700" role="alert">{fieldErrors().lines}</p>
      </Show>
      <StockAdjustmentLineGrid lines={lines} onChange={setLines} disabled={readOnly()} />
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
