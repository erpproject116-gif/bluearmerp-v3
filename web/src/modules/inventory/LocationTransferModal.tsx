import { createEffect, createSignal, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { AttachmentsField } from "../../shared/AttachmentsField";
import { DateInput } from "../../shared/DateInput";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import {
  collectRequiredFieldErrors,
  handleSaveResult,
  showClientValidationBlocker,
} from "../../shared/handleSaveResult";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { RecordHistoryButton } from "../../shared/RecordHistoryButton";
import { ModalField } from "../../shared/ModalField";
import { inputClass } from "../../shared/SpreadsheetGrid";
import { CustomFieldsSection, collectCustomFieldErrors } from "../../shared/CustomFieldsSection";
import { useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { useToast } from "../../shared/toast";
import { WideEntityModal } from "../../shared/WideEntityModal";
import { ModuleIcon } from "../../shell/ModuleIcon";
import {
  emptyTransferLine,
  LocationTransferLineGrid,
  type LocationTransferLineRow,
} from "./LocationTransferLineGrid";

export type LocationTransferDetail = {
  id: number;
  entry_no: string;
  entry_date: string;
  entry_type: string;
  from_location_id?: number | null;
  to_location_id?: number | null;
  from_location_name?: string;
  to_location_name?: string;
  status: string;
  notes?: string | null;
  pic_user_id?: number | null;
  pic_name?: string;
  project_id?: number | null;
  project_name?: string;
  requested_by_name?: string;
  requested_at?: string | null;
  approved_by_name?: string;
  approved_at?: string | null;
  custom_values?: Record<string, unknown>;
  lines?: Array<{
    id?: number;
    line_no: number;
    item_id: number;
    item_code: string;
    item_name: string;
    qty: number;
    remark?: string;
    serial_lot_count?: number;
    serial_unit_ids?: number[];
    lot_batch_id?: number | null;
    lot_no?: string;
    track_serial?: boolean;
    track_lot?: boolean;
    serial_policy?: string;
    lot_policy?: string;
  }>;
};

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(
    `/api/v1/inventory/after-sales/users${qs}`,
  );
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name || u.email }));
}

async function fetchProjects(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_name: string }[]>(`/api/v1/inventory/projects?${qs}`);
  return (res.data ?? []).map((p) => ({ id: p.id, label: p.project_name }));
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type Props = {
  open: boolean;
  editing?: LocationTransferDetail | null;
  onClose: () => void;
  onSaved: () => void;
};

const STOCK_ENTRY_ENTITY = "inv_stock_entry";

export function LocationTransferModal(props: Props) {
  const toast = useToast();
  const { byKey, fields } = useFormFieldSettings(STOCK_ENTRY_ENTITY);
  const [customValues, setCustomValues] = createSignal<Record<string, unknown>>({});
  const [entryDate, setEntryDate] = createSignal(todayISO());
  const [entryNo, setEntryNo] = createSignal("");
  const [entryId, setEntryId] = createSignal<number | null>(null);
  const [status, setStatus] = createSignal("draft");
  const [fromLocId, setFromLocId] = createSignal<number | null>(null);
  const [fromLocLabel, setFromLocLabel] = createSignal("");
  const [toLocId, setToLocId] = createSignal<number | null>(null);
  const [toLocLabel, setToLocLabel] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [reason, setReason] = createSignal("");
  const [lines, setLines] = createSignal<LocationTransferLineRow[]>([emptyTransferLine(1)]);
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string | undefined>>({});
  const [requestedBy, setRequestedBy] = createSignal("");
  const [requestedAt, setRequestedAt] = createSignal<string | null>(null);
  const [approvedBy, setApprovedBy] = createSignal("");
  const [approvedAt, setApprovedAt] = createSignal<string | null>(null);

  const readOnly = () => status() === "posted" || status() === "cancelled";

  const hydrate = (ed: LocationTransferDetail) => {
    setEntryId(ed.id);
    setEntryNo(ed.entry_no);
    setEntryDate(ed.entry_date);
    setStatus(ed.status);
    setFromLocId(ed.from_location_id ?? null);
    setFromLocLabel(ed.from_location_name ?? "");
    setToLocId(ed.to_location_id ?? null);
    setToLocLabel(ed.to_location_name ?? "");
    setPicUserId(ed.pic_user_id ?? null);
    setPicName(ed.pic_name ?? "");
    setProjectId(ed.project_id ?? null);
    setProjectLabel(ed.project_name ?? "");
    setReason(ed.notes?.trim() ?? "");
    setCustomValues(ed.custom_values ?? {});
    setRequestedBy(ed.requested_by_name ?? "");
    setRequestedAt(ed.requested_at ?? null);
    setApprovedBy(ed.approved_by_name ?? "");
    setApprovedAt(ed.approved_at ?? null);
    const mapped =
      ed.lines?.map((ln, i) => ({
        line_no: ln.line_no || i + 1,
        item_id: ln.item_id,
        item_label: `${ln.item_code} — ${ln.item_name}`,
        item_code: ln.item_code,
        item_name: ln.item_name,
        qty: String(ln.qty),
        remark: ln.remark ?? "",
        track_serial: Boolean(ln.track_serial),
        track_lot: Boolean(ln.track_lot),
        serial_policy: ln.serial_policy ?? "required",
        lot_policy: ln.lot_policy ?? "required",
        serial_unit_ids: ln.serial_unit_ids ?? [],
        serial_labels: "",
        lot_batch_id: ln.lot_batch_id ?? null,
        lot_no: ln.lot_no ?? "",
      })) ?? [emptyTransferLine(1)];
    setLines(mapped.length ? mapped : [emptyTransferLine(1)]);
  };

  createEffect(() => {
    if (!props.open) return;
    setFieldErrors({});
    const ed = props.editing;
    if (ed) {
      hydrate(ed);
      return;
    }
    setEntryId(null);
    setEntryNo("");
    setEntryDate(todayISO());
    setStatus("draft");
    setFromLocId(null);
    setFromLocLabel("");
    setToLocId(null);
    setToLocLabel("");
    setPicUserId(null);
    setPicName("");
    setProjectId(null);
    setProjectLabel("");
    setReason("");
    setCustomValues({});
    setLines([emptyTransferLine(1)]);
    setRequestedBy("");
    setRequestedAt(null);
    setApprovedBy("");
    setApprovedAt(null);
  });

  const buildBody = () => ({
    entry_date: entryDate(),
    entry_type: "transfer",
    from_location_id: fromLocId(),
    to_location_id: toLocId(),
    notes: reason().trim(),
    pic_user_id: picUserId(),
    pic_name: picName().trim() || null,
    project_id: projectId(),
    project_name: projectLabel().trim() || null,
    custom_values: customValues(),
    lines: lines()
      .filter((ln) => ln.item_id && Number(ln.qty) > 0)
      .map((ln) => ({
        item_id: ln.item_id!,
        qty: Number(ln.qty),
        remark: ln.remark.trim(),
        serial_unit_ids: ln.track_serial && ln.serial_unit_ids?.length ? ln.serial_unit_ids : undefined,
        lot_batch_id: ln.track_lot && ln.lot_batch_id ? ln.lot_batch_id : undefined,
      })),
  });

  const save = async (andPost: boolean) => {
    if (readOnly()) return;
    setFieldErrors({});
    const validationErrors = collectRequiredFieldErrors(
      {
        entry_date: entryDate(),
        from_location_id: fromLocId(),
        to_location_id: toLocId(),
        notes: reason().trim(),
        lines: buildBody().lines.length,
      },
      [
        { key: "entry_date", label: "Date" },
        { key: "from_location_id", label: "Location out" },
        { key: "to_location_id", label: "Location in" },
        { key: "notes", label: "Reason" },
        { key: "lines", label: "Line items" },
      ],
    );
    if (fromLocId() && toLocId() && fromLocId() === toLocId()) {
      validationErrors.to_location_id = "Destination must be different from the source location.";
    }
    const customDefs = fields()
      .filter((f) => f.kind === "custom" && f.is_active && f.is_visible)
      .map((f) => ({ field_key: f.field_key, label: f.label, is_required: f.is_required }));
    Object.assign(validationErrors, collectCustomFieldErrors(customValues(), customDefs));
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      showClientValidationBlocker(validationErrors, toast);
      return;
    }

    setSaving(true);
    const body = buildBody();
    const id = entryId();
    const res = await (id
      ? apiFetch<LocationTransferDetail>(`/api/v1/inventory/stock-entries/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }, { silent: true })
      : apiFetch<LocationTransferDetail>("/api/v1/inventory/stock-entries", {
          method: "POST",
          body: JSON.stringify(body),
        }, { silent: true }));

    if (!res.success || !res.data) {
      setSaving(false);
      handleSaveResult(res, toast, "Transfer saved.", { onFieldErrors: setFieldErrors });
      return;
    }

    setEntryId(res.data.id);
    setEntryNo(res.data.entry_no);
    setStatus(res.data.status);
    hydrate(res.data);

    if (andPost) {
      const postRes = await apiFetch<LocationTransferDetail>(
        `/api/v1/inventory/stock-entries/${res.data.id}/post`,
        { method: "POST" },
        { silent: true },
      );
      setSaving(false);
      if (!postRes.success || !postRes.data) {
        handleSaveResult(postRes, toast, "Transfer posted.", { onFieldErrors: setFieldErrors });
        props.onSaved();
        return;
      }
      hydrate(postRes.data);
      toast.success(`Transfer ${postRes.data.entry_no} posted.`);
      props.onSaved();
      props.onClose();
      return;
    }

    setSaving(false);
    toast.success(`Transfer ${res.data.entry_no} saved as draft.`);
    props.onSaved();
  };

  return (
    <WideEntityModal
      open={props.open}
      title={entryId() ? (readOnly() ? `Transfer ${entryNo()}` : `Edit transfer ${entryNo()}`) : "New Stocks Transfer"}
      icon={<ModuleIcon id="inventory" class="h-5 w-5" />}
      onClose={() => props.onClose()}
      onSave={readOnly() ? undefined : () => void save(false)}
      saving={saving()}
      readOnly={readOnly()}
      headerActions={
        <>
          <Show when={entryId()}>
            <RecordHistoryButton
              variant="button"
              targetType="inv_stock_entry"
              targetId={entryId()}
              title={entryNo() ? `History — ${entryNo()}` : "History"}
            />
          </Show>
          <Show when={!readOnly()}>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={saving()}
              onClick={() => void save(true)}
            >
              {saving() ? "Saving…" : "Save & post"}
            </button>
          </Show>
        </>
      }
    >
      <FormErrorSummary errors={fieldErrors} />
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ModalField settings={byKey} fieldKey="entry_date" fallbackLabel="Date" fallbackRequired errors={fieldErrors}>
          {(m) => (
            <DateInput
              class={inputClass}
              value={entryDate()}
              disabled={readOnly() || m.disabled}
              onInput={(e) => setEntryDate(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="entry_no" fallbackLabel="Transfer number">
          {(m) => (
            <input class={inputClass} value={entryNo() || "Assigned on save"} readOnly disabled={m.disabled} />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="from_location_id" fallbackLabel="Location out" fallbackRequired bare errors={fieldErrors}>
          {(m) => (
            <LookupCombo
              label={m.label}
              required={m.required}
              value={fromLocLabel}
              selectedId={fromLocId}
              error={fieldErrors().from_location_id}
              disabled={readOnly() || m.disabled}
              onInput={setFromLocLabel}
              onSelect={(o) => {
                setFromLocId(o.id);
                setFromLocLabel(o.label);
              }}
              onClear={() => {
                setFromLocId(null);
                setFromLocLabel("");
              }}
              fetchOptions={fetchLocations}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="to_location_id" fallbackLabel="Location in" fallbackRequired bare errors={fieldErrors}>
          {(m) => (
            <LookupCombo
              label={m.label}
              required={m.required}
              value={toLocLabel}
              selectedId={toLocId}
              error={fieldErrors().to_location_id}
              disabled={readOnly() || m.disabled}
              onInput={setToLocLabel}
              onSelect={(o) => {
                setToLocId(o.id);
                setToLocLabel(o.label);
              }}
              onClear={() => {
                setToLocId(null);
                setToLocLabel("");
              }}
              fetchOptions={fetchLocations}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="pic_name" fallbackLabel="Person in charge" bare>
          {(m) => (
            <LookupCombo
              label={m.label}
              value={picName}
              selectedId={picUserId}
              disabled={readOnly() || m.disabled}
              onInput={setPicName}
              onSelect={(o) => {
                setPicUserId(o.id);
                setPicName(o.label);
              }}
              onClear={() => {
                setPicUserId(null);
                setPicName("");
              }}
              fetchOptions={fetchUsers}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="project_id" fallbackLabel="Project" bare>
          {(m) => (
            <LookupCombo
              label={m.label}
              value={projectLabel}
              selectedId={projectId}
              disabled={readOnly() || m.disabled}
              onInput={setProjectLabel}
              onSelect={(o) => {
                setProjectId(o.id);
                setProjectLabel(o.label);
              }}
              onClear={() => {
                setProjectId(null);
                setProjectLabel("");
              }}
              fetchOptions={fetchProjects}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="notes" fallbackLabel="Reason" fallbackRequired span="full" errors={fieldErrors}>
          {(m) => (
            <textarea
              rows={2}
              class={inputClass}
              value={reason()}
              disabled={readOnly() || m.disabled}
              placeholder={m.placeholder || "Why is this stock moving?"}
              onInput={(e) => setReason(e.currentTarget.value)}
              {...m.inputProps}
            />
          )}
        </ModalField>
        <div class="col-span-full">
          <CustomFieldsSection
            entityType={STOCK_ENTRY_ENTITY}
            values={customValues}
            onChange={(key, value) => setCustomValues((prev) => ({ ...prev, [key]: value }))}
          />
        </div>
        <Show when={requestedBy() || approvedBy()}>
          <div class="col-span-full grid gap-2 rounded-lg border border-stroke bg-slate-50/80 px-3 py-2 text-xs text-text-secondary sm:grid-cols-2">
            <p>
              Requested by <span class="font-medium text-text-primary">{requestedBy() || "—"}</span>
              <Show when={requestedAt()}>
                {" "}
                · {new Date(requestedAt()!).toLocaleString()}
              </Show>
            </p>
            <p>
              Approved by <span class="font-medium text-text-primary">{approvedBy() || "—"}</span>
              <Show when={approvedAt()}>
                {" "}
                · {new Date(approvedAt()!).toLocaleString()}
              </Show>
            </p>
          </div>
        </Show>
        <Show when={entryId()}>
          <div class="col-span-full">
            <AttachmentsField scope="inventory/stock-entries" docId={entryId()!} formOpen={props.open} />
          </div>
        </Show>
        <LocationTransferLineGrid
          lines={lines}
          onChange={setLines}
          fromLocationId={fromLocId}
          disabled={readOnly()}
          errors={fieldErrors()}
        />
      </div>
    </WideEntityModal>
  );
}
