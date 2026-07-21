import { createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { submitEntity } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { QuickLocationModal } from "../../shared/QuickLocationModal";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

async function fetchItems(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; item_code: string; item_name: string }[]>(`/api/v1/inventory/items?${qs}`);
  return (res.data ?? []).map((i) => ({ id: i.id, label: `${i.item_code} — ${i.item_name}` }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

export function StockAdjustmentModal(props: Props) {
  const toast = useToast();
  const auth = useAuth();
  const [saving, setSaving] = createSignal(false);
  const [itemId, setItemId] = createSignal<number | null>(null);
  const [itemLabel, setItemLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [qtyDelta, setQtyDelta] = createSignal("");
  const [reason, setReason] = createSignal("");

  const reset = () => {
    setItemId(null);
    setItemLabel("");
    setLocationId(null);
    setLocationLabel("");
    setQtyDelta("");
    setReason("");
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.invStockAdjustment,
    draftKey: "new",
    getPayload: () => ({
      item_id: itemId(),
      item_label: itemLabel(),
      location_id: locationId(),
      location_label: locationLabel(),
      qty_delta: qtyDelta(),
      reason: reason(),
    }),
    onApply: (payload) => {
      setItemId(payload.item_id);
      setItemLabel(payload.item_label);
      setLocationId(payload.location_id);
      setLocationLabel(payload.location_label);
      setQtyDelta(payload.qty_delta);
      setReason(payload.reason);
    },
    enabled: () => props.open,
    autoApply: () => props.open,
  });

  const save = async () => {
    if (!itemId() || !locationId()) {
      toast.warning("Item and location are required.");
      return;
    }
    const qty = Number(qtyDelta());
    if (!qtyDelta() || qty === 0 || Number.isNaN(qty)) {
      toast.warning("Enter a non-zero quantity change.");
      return;
    }
    if (!reason().trim()) {
      toast.warning("Reason is required.");
      return;
    }
    setSaving(true);
    const ok = await submitEntity(
      () =>
        apiFetch("/api/v1/inventory/stock-adjustments", {
          method: "POST",
          body: JSON.stringify({
            item_id: itemId(),
            location_id: locationId(),
            qty_delta: qty,
            reason: reason().trim(),
          }),
        }, { silent: true }),
      toast,
      "Stock adjusted.",
    );
    setSaving(false);
    if (!ok) return;
    await draft.clearOnSave();
    reset();
    props.onSaved();
    props.onClose();
  };

  return (
    <>
    <EntityModal
      open={props.open}
      title="Stock adjustment"
      onClose={() => {
        reset();
        props.onClose();
      }}
      onSave={() => void save()}
      saving={saving()}
    >
      <draft.DraftBanner />
      <ModalFormGuide guideId="stock_adjustment" spanFull />
      <LookupCombo
        label="Item *"
        value={itemLabel}
        selectedId={itemId}
        onInput={setItemLabel}
        onSelect={(o) => {
          setItemId(o.id);
          setItemLabel(o.label);
        }}
        onClear={() => {
          setItemId(null);
          setItemLabel("");
        }}
        fetchOptions={fetchItems}
      />
      <LookupCombo
        label="Location *"
        value={locationLabel}
        selectedId={locationId}
        onInput={setLocationLabel}
        onSelect={(o) => {
          setLocationId(o.id);
          setLocationLabel(o.label);
        }}
        onClear={() => {
          setLocationId(null);
          setLocationLabel("");
        }}
        fetchOptions={fetchLocations}
        createLabel="Add location"
        onCreate={
          hasPermission(auth.me, "inventory.locations", "write")
            ? (q) => {
                setNewLocationName(q);
                setShowNewLocation(true);
              }
            : undefined
        }
      />
      <Field label="Qty change *">
        <input
          type="number"
          step="any"
          class={inputClass}
          value={qtyDelta()}
          placeholder="Positive to add, negative to remove"
          onInput={(e) => setQtyDelta(e.currentTarget.value)}
        />
      </Field>
      <Field label="Reason *" span="full">
        <textarea class={inputClass} rows={2} value={reason()} onInput={(e) => setReason(e.currentTarget.value)} />
      </Field>
    </EntityModal>

    <QuickLocationModal
      open={showNewLocation()}
      initialName={newLocationName()}
      onClose={() => setShowNewLocation(false)}
      onCreated={(l) => {
        setLocationId(l.id);
        setLocationLabel(l.location_name);
      }}
    />
    </>
  );
}
