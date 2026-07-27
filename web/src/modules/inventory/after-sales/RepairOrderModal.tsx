import { createEffect, createSignal, For, Show } from "solid-js";
import { useQueryClient } from "@tanstack/solid-query";
import { apiFetch } from "../../../shared/api";
import { invalidateRecordHistory } from "../../../shared/invalidateRecordHistory";
import { RecordHistoryButton } from "../../../shared/RecordHistoryButton";
import { ChangeLogPanel } from "../../../shared/ChangeLogPanel";
import { CustomFieldsSection, validateCustomFields } from "../../../shared/CustomFieldsSection";
import { EditableLineGrid, emptyLine, type RepairLineRow } from "../../../shared/EditableLineGrid";
import { INVENTORY_ENTITY } from "../../../shared/entityTypes";
import { handleSaveResult, requireFields } from "../../../shared/handleSaveResult";
import type { LookupOption } from "../../../shared/LookupCombo";
import {
  formatFileSize,
  listRepairOrderAttachments,
  uploadRepairOrderAttachment,
  type RepairOrderAttachment,
} from "../../../shared/repairOrderAttachments";
import { DateInput } from "../../../shared/DateInput";
import { ModalField } from "../../../shared/ModalField";
import { uiLabel } from "../../../shared/branding/uiLabel";
import { ModalLookupField } from "../../../shared/ModalLookupField";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { useCustomValues } from "../../../shared/useCustomValues";
import { buildRequiredChecksForSave, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { type SerialTraceResult } from "../../../shared/useSerialLotList";
import { useDocumentDraft } from "../../../shared/useDocumentDraft";
import { WideEntityModal } from "../../../shared/WideEntityModal";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { QuickCustomerModal } from "../../../shared/QuickCustomerModal";
import { QuickLocationModal } from "../../../shared/QuickLocationModal";
import { LoadSlipMenu, REPAIR_LOAD_SLIP_OPTIONS, filterLoadSlipOptions } from "../../../shared/LoadSlipMenu";
import {
  SalesOrderLinePickerModal,
  type PickedSalesOrderLine,
} from "../../sales/sales/SalesOrderLinePickerModal";
import {
  QuotationLinePickerModal,
  type PickedQuotationLine,
} from "../../sales-order/sales-order/QuotationLinePickerModal";
import { PurchaseRequestLinePickerModal, type PickedPurchaseRequestLine } from "../../purchase-request/purchase-order/PurchaseRequestLinePickerModal";

export type RepairOrderDetail = {
  id: number;
  order_date: string;
  date_no_display: string;
  repair_order_no: string;
  partner_id: number;
  customer_name: string;
  pic_user_id?: number | null;
  pic_name: string;
  location_id: number;
  location_name?: string;
  project_id?: number | null;
  project_name?: string | null;
  technician_name?: string | null;
  progress_status: string;
  scheduled_completion_date?: string | null;
  latest_update?: string | null;
  repair_details?: string | null;
  lines?: Array<{
    line_no: number;
    item_id?: number | null;
    item_code: string;
    item_name: string;
    problem_issue?: string | null;
    service_charge?: number | null;
    tax_type?: string | null;
    qty: number;
    mop?: string | null;
    serial_lot_no?: string | null;
    remark?: string | null;
  }>;
  custom_values?: Record<string, unknown>;
};

type Props = {
  open: boolean;
  editing: RepairOrderDetail | null;
  onClose: () => void;
  onSaved: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchPartners(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, label: p.company_name }));
}

async function fetchLocations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_name: string }[]>(`/api/v1/inventory/locations?${qs}`);
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
}

async function fetchProjects(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_name: string }[]>(`/api/v1/inventory/projects?${qs}`);
  return (res.data ?? []).map((p) => ({ id: p.id, label: p.project_name }));
}

async function fetchUsers(q: string): Promise<LookupOption[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string; email: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, label: u.full_name, sublabel: u.email }));
}

function linesFromDetail(lines?: RepairOrderDetail["lines"]): RepairLineRow[] {
  if (!lines?.length) return [emptyLine(1)];
  return lines.map((ln) => ({
    line_no: ln.line_no,
    item_id: ln.item_id,
    item_code: ln.item_code ?? "",
    item_name: ln.item_name ?? "",
    problem_issue: ln.problem_issue ?? "",
    service_charge: ln.service_charge != null ? String(ln.service_charge) : "",
    tax_type: ln.tax_type ?? "",
    qty: ln.qty != null ? String(ln.qty) : "",
    mop: ln.mop ?? "",
    serial_lot_no: ln.serial_lot_no ?? "",
    remark: ln.remark ?? "",
  }));
}

export function RepairOrderModal(props: Props) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { fields, byKey, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.repairOrder);

  const [saving, setSaving] = createSignal(false);
  const [createdOrder, setCreatedOrder] = createSignal<RepairOrderDetail | null>(null);
  const effectiveEditing = () => props.editing ?? createdOrder();
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [repairOrderNo, setRepairOrderNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
  const [showNewCustomer, setShowNewCustomer] = createSignal(false);
  const [newCustomerName, setNewCustomerName] = createSignal("");
  const [showNewLocation, setShowNewLocation] = createSignal(false);
  const [newLocationName, setNewLocationName] = createSignal("");
  const [picUserId, setPicUserId] = createSignal<number | null>(null);
  const [picName, setPicName] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [projectId, setProjectId] = createSignal<number | null>(null);
  const [projectLabel, setProjectLabel] = createSignal("");
  const [projectName, setProjectName] = createSignal("");
  const [technicianName, setTechnicianName] = createSignal("");
  const [progressStatus, setProgressStatus] = createSignal("received");
  const [scheduledDate, setScheduledDate] = createSignal("");
  const [latestUpdate, setLatestUpdate] = createSignal("");
  const [repairDetails, setRepairDetails] = createSignal("");
  const [lines, setLines] = createSignal<RepairLineRow[]>([emptyLine(1)]);
  const [soPickerOpen, setSoPickerOpen] = createSignal(false);
  const [quotationPickerOpen, setQuotationPickerOpen] = createSignal(false);
  const [prPickerOpen, setPrPickerOpen] = createSignal(false);
  const [attachments, setAttachments] = createSignal<RepairOrderAttachment[]>([]);
  const [uploading, setUploading] = createSignal(false);

  const loadAttachments = async (orderId: number) => {
    const res = await listRepairOrderAttachments(orderId);
    if (res.success && res.data) setAttachments(res.data);
    else setAttachments([]);
  };

  const loadPreview = async (date: string) => {
    const res = await apiFetch<{ date_no_display: string; repair_order_no: string }>(
      `/api/v1/inventory/repair-orders/preview-sequences?order_date=${encodeURIComponent(date)}`,
    );
    if (res.success && res.data) {
      setDateNoDisplay(res.data.date_no_display);
      setRepairOrderNo(res.data.repair_order_no);
    }
  };

  createEffect(() => {
    if (!props.open) {
      setCreatedOrder(null);
      setAttachments([]);
      return;
    }
    const ed = props.editing;
    if (ed) {
      setOrderDate(ed.order_date);
      setDateNoDisplay(ed.date_no_display);
      setRepairOrderNo(ed.repair_order_no);
      setPartnerId(ed.partner_id);
      setCustomerLabel(ed.customer_name);
      setPicUserId(ed.pic_user_id ?? null);
      setPicName(ed.pic_name);
      setLocationId(ed.location_id);
      setLocationLabel(ed.location_name ?? "");
      setProjectId(ed.project_id ?? null);
      setProjectLabel(ed.project_name ?? "");
      setProjectName(ed.project_name ?? "");
      setTechnicianName(ed.technician_name ?? "");
      setProgressStatus(ed.progress_status || "received");
      setScheduledDate(ed.scheduled_completion_date ?? "");
      setLatestUpdate(ed.latest_update ?? "");
      setRepairDetails(ed.repair_details ?? "");
      setLines(linesFromDetail(ed.lines));
      loadCustom(ed.custom_values ?? {});
      void loadAttachments(ed.id);
    } else {
      setOrderDate(todayISO());
      setPartnerId(null);
      setCustomerLabel("");
      setPicUserId(null);
      setPicName("");
      setLocationId(null);
      setLocationLabel("");
      setProjectId(null);
      setProjectLabel("");
      setProjectName("");
      setTechnicianName("");
      setProgressStatus("received");
      setScheduledDate("");
      setLatestUpdate("");
      setRepairDetails("");
      setLines([emptyLine(1)]);
      setAttachments([]);
      loadCustom({});
      void loadPreview(todayISO());
    }
  });

  createEffect(() => {
    if (props.open && !props.editing) {
      void loadPreview(orderDate());
    }
  });

  const formValues = () => ({
    order_date: orderDate(),
    partner_id: partnerId(),
    pic_name: picName(),
    location_id: locationId(),
    progress_status: progressStatus() || "received",
    scheduled_completion_date: scheduledDate(),
    latest_update: latestUpdate(),
    repair_details: repairDetails(),
    project_id: projectId(),
    project_name: projectName(),
    technician_name: technicianName(),
  });

  const buildDraftPayload = () => ({
    ...formValues(),
    customer_label: customerLabel(),
    pic_user_id: picUserId(),
    location_label: locationLabel(),
    project_label: projectLabel(),
    lines: lines(),
  });

  const draft = useDocumentDraft({
    entityType: INVENTORY_ENTITY.repairOrder,
    draftKey: () => (effectiveEditing() ? `edit-${effectiveEditing()!.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: (payload) => {
      setOrderDate(payload.order_date);
      setPartnerId(payload.partner_id);
      setCustomerLabel(payload.customer_label);
      setPicUserId(payload.pic_user_id);
      setPicName(payload.pic_name);
      setLocationId(payload.location_id);
      setLocationLabel(payload.location_label);
      setProjectId(payload.project_id);
      setProjectLabel(payload.project_label);
      setProjectName(payload.project_name);
      setTechnicianName(payload.technician_name);
      setProgressStatus(payload.progress_status || "received");
      setScheduledDate(payload.scheduled_completion_date);
      setLatestUpdate(payload.latest_update);
      setRepairDetails(payload.repair_details);
      setLines(payload.lines?.length ? payload.lines : [emptyLine(1)]);
    },
    enabled: () => props.open,
    // The "new" branch above calls loadPreview() asynchronously, so autoApply could race
    // with it — prefer the Restore banner over a silent overwrite.
  });

  const onSerialLotBlur = async (index: number, serialNo: string) => {
    const trimmed = serialNo.trim();
    if (!trimmed) return;
    const qs = new URLSearchParams({ serial_no: trimmed });
    const res = await apiFetch<SerialTraceResult>(`/api/v1/inventory/serial-units/trace?${qs}`, {}, { silent: true });
    if (!res.success || !res.data?.unit) return;
    const unit = res.data.unit;
    setLines((prev) =>
      prev.map((ln, i) =>
        i === index
          ? {
              ...ln,
              item_id: unit.item_id,
              item_code: unit.item_code,
              item_name: unit.item_name,
            }
          : ln,
      ),
    );
  };

  const applySalesOrderLines = (picked: PickedSalesOrderLine[]) => {
    if (picked.length === 0) return;
    const first = picked[0];
    setPartnerId(first.partner_id);
    setCustomerLabel(first.customer_name);
    if (first.location_id) {
      setLocationId(first.location_id);
      setLocationLabel(first.location_name);
    }
    setLines(
      picked.map((row, i) => ({
        ...emptyLine(i + 1),
        item_id: row.item_id ?? null,
        item_code: row.item_code,
        item_name: row.item_name,
        qty: String(row.balance_qty > 0 ? row.balance_qty : row.released_qty || 1),
        remark: row.remark ?? row.description ?? "",
        problem_issue: row.description ?? "",
      })),
    );
  };

  const mapLinesOntoRepair = (
    rows: Array<{
      item_id?: number | null;
      item_code: string;
      item_name: string;
      qty: number;
      remark?: string;
    }>,
  ) => {
    if (rows.length === 0) return;
    const mapped = rows.map((row, i) => ({
      ...emptyLine(i + 1),
      item_id: row.item_id ?? null,
      item_code: row.item_code,
      item_name: row.item_name,
      qty: String(row.qty || 1),
      remark: row.remark ?? "",
    }));
    setLines(
      [...lines().filter((ln) => ln.item_id || ln.item_code), ...mapped].map((ln, i) => ({
        ...ln,
        line_no: i + 1,
      })),
    );
  };

  const save = async () => {
    if (!partnerId()) {
      toast.warning("Please select a customer.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const status = (progressStatus() || "received").trim() || "received";
    if (progressStatus() !== status) setProgressStatus(status);
    const { checks, values } = buildRequiredChecksForSave(fields(), formValues(), {
      progress_status: "received",
    });
    const clientError =
      requireFields(values, checks) ??
      validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }

    const body = {
      order_date: orderDate(),
      partner_id: partnerId(),
      pic_user_id: picUserId(),
      pic_name: picName(),
      location_id: locationId(),
      project_id: projectId(),
      project_name: projectName() || null,
      technician_name: technicianName() || null,
      progress_status: status,
      scheduled_completion_date: scheduledDate() || null,
      latest_update: latestUpdate() || null,
      repair_details: repairDetails() || null,
      lines: lines().map((ln, i) => ({
        line_no: i + 1,
        item_id: ln.item_id || null,
        item_code: ln.item_code,
        item_name: ln.item_name,
        problem_issue: ln.problem_issue || null,
        service_charge: ln.service_charge === "" ? null : Number(ln.service_charge),
        tax_type: ln.tax_type || null,
        qty: ln.qty === "" ? 0 : Number(ln.qty),
        mop: ln.mop || null,
        serial_lot_no: ln.serial_lot_no || null,
        remark: ln.remark || null,
      })),
      custom_values: customValues(),
    };

    setSaving(true);
    const ed = effectiveEditing();
    const res = await (ed
      ? apiFetch<RepairOrderDetail>(`/api/v1/inventory/repair-orders/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) }, { silent: true })
      : apiFetch<RepairOrderDetail>("/api/v1/inventory/repair-orders", { method: "POST", body: JSON.stringify(body) }, { silent: true }));
    setSaving(false);
    if (!res.success || !res.data) {
      handleSaveResult(res, toast, props.editing ? "Repair order updated." : "Repair order created.");
      return;
    }
    toast.success(props.editing ? "Repair order updated." : "Repair order created.");
    if (props.editing) invalidateRecordHistory(queryClient, "inv_repair_order", props.editing.id);
    await draft.clearOnSave();
    props.onSaved();
    if (props.editing) {
      props.onClose();
      return;
    }
    setCreatedOrder(res.data);
    void loadAttachments(res.data.id);
  };

  return (
    <>
    <WideEntityModal
      open={props.open}
      title={effectiveEditing() ? "Edit Repair Order" : "New Repair Order"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
      headerActions={
        <Show when={effectiveEditing()}>
          <RecordHistoryButton
            variant="button"
            targetType="inv_repair_order"
            targetId={effectiveEditing()?.id}
            title={`History — ${effectiveEditing()?.repair_order_no ?? "Repair Order"}`}
          />
        </Show>
      }
    >
      <div class="space-y-4">
      <ModalFormGuide guideId="repair_order" />
      <draft.DraftBanner />
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Date-no">
          <input class={inputClass} value={dateNoDisplay()} readOnly />
        </Field>
        <Field label="Repair Order No.">
          <input class={inputClass} value={repairOrderNo()} readOnly />
        </Field>
        <ModalField settings={byKey} fieldKey="order_date" fallbackLabel="Date" fallbackRequired>
          {(m) => (
            <DateInput value={orderDate()} disabled={m.disabled} onInput={(e) => setOrderDate(e.currentTarget.value)} />
          )}
        </ModalField>
        <ModalLookupField
          settings={byKey}
          fieldKey="partner_id"
          fallbackLabel="Customer"
          fallbackRequired
          value={customerLabel}
          selectedId={partnerId}
          onInput={setCustomerLabel}
          onSelect={(o) => {
            setPartnerId(o.id);
            setCustomerLabel(o.label);
          }}
          onClear={() => {
            setPartnerId(null);
            setCustomerLabel("");
          }}
          fetchOptions={fetchPartners}
          createLabel="Add customer"
          onCreate={
            hasPermission(auth.me, "inventory.partners", "write")
              ? (q) => {
                  setNewCustomerName(q);
                  setShowNewCustomer(true);
                }
              : undefined
          }
        />
        <ModalLookupField
          settings={byKey}
          fieldKey="pic_name"
          fallbackLabel="PIC"
          fallbackPlaceholder="Type a name or pick a user"
          value={picName}
          selectedId={picUserId}
          onInput={(text) => {
            setPicName(text);
            // Free-text PIC name: clear linked user when typing diverges from a pick.
            setPicUserId(null);
          }}
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
        <ModalLookupField
          settings={byKey}
          fieldKey="location_id"
          fallbackLabel="Location"
          fallbackRequired
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
        <ModalField settings={byKey} fieldKey="progress_status" fallbackLabel="Progress status">
          {(m) => (
            <select
              class={inputClass}
              value={progressStatus()}
              disabled={m.disabled}
              onChange={(e) => setProgressStatus(e.currentTarget.value)}
            >
              <option value="received">Received</option>
              <option value="finished">Finished</option>
            </select>
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="scheduled_completion_date" fallbackLabel="Scheduled completion date">
          {(m) => (
            <DateInput value={scheduledDate()} disabled={m.disabled} onInput={(e) => setScheduledDate(e.currentTarget.value)} />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="latest_update" fallbackLabel="Latest update" span="full">
          {(m) => (
            <textarea
              class={inputClass}
              rows={2}
              value={latestUpdate()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setLatestUpdate(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="repair_details" fallbackLabel="Repair details" span="full">
          {(m) => (
            <textarea
              class={inputClass}
              rows={2}
              value={repairDetails()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setRepairDetails(e.currentTarget.value)}
            />
          )}
        </ModalField>
      </div>
      <div class="rounded-lg border border-stroke bg-slate-50 px-4 py-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-text-primary">{uiLabel("common.attachments")}</span>
          <Show when={effectiveEditing()}>
            <label class="cursor-pointer rounded border border-stroke bg-white px-3 py-1 text-sm hover:bg-slate-50">
              {uploading() ? "Uploading…" : "Upload file"}
              <input
                type="file"
                class="hidden"
                disabled={uploading()}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  const orderId = effectiveEditing()?.id;
                  if (!file || !orderId) return;
                  setUploading(true);
                  void uploadRepairOrderAttachment(orderId, file).then((res) => {
                    setUploading(false);
                    if (!res.success) {
                      toast.warning(res.message ?? "Upload failed.");
                      return;
                    }
                    toast.success("File uploaded.");
                    void loadAttachments(orderId);
                  });
                }}
              />
            </label>
          </Show>
        </div>
        <Show
          when={effectiveEditing()}
          fallback={<p class="text-sm text-text-secondary">Save the repair order first to attach files (max 25 MB each).</p>}
        >
          <Show when={attachments().length > 0} fallback={<p class="text-sm text-text-secondary">No attachments yet.</p>}>
            <ul class="space-y-1 text-sm">
              <For each={attachments()}>
                {(a) => (
                  <li class="flex justify-between gap-2 text-text-primary">
                    <span>{a.file_name}</span>
                    <span class="text-text-secondary">{formatFileSize(a.size_bytes)}</span>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </Show>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ModalLookupField
          settings={byKey}
          fieldKey="project_id"
          fallbackLabel="Project"
          value={projectLabel}
          selectedId={projectId}
          onInput={setProjectLabel}
          onSelect={(o) => {
            setProjectId(o.id);
            setProjectLabel(o.label);
            setProjectName(o.label);
          }}
          onClear={() => {
            setProjectId(null);
            setProjectLabel("");
          }}
          fetchOptions={fetchProjects}
        />
        <ModalField settings={byKey} fieldKey="project_name" fallbackLabel="Project name">
          {(m) => (
            <input
              class={inputClass}
              value={projectName()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setProjectName(e.currentTarget.value)}
            />
          )}
        </ModalField>
        <ModalField settings={byKey} fieldKey="technician_name" fallbackLabel="Technician">
          {(m) => (
            <input
              class={inputClass}
              value={technicianName()}
              placeholder={m.placeholder}
              disabled={m.disabled}
              onInput={(e) => setTechnicianName(e.currentTarget.value)}
            />
          )}
        </ModalField>
      </div>
      <div class="mb-2">
        <LoadSlipMenu
          options={filterLoadSlipOptions(REPAIR_LOAD_SLIP_OPTIONS, auth.me)}
          onSelect={(id) => {
            if (id === "so") setSoPickerOpen(true);
            if (id === "quotation") setQuotationPickerOpen(true);
            if (id === "pr") setPrPickerOpen(true);
          }}
        />
      </div>
      <EditableLineGrid lines={lines} onChange={setLines} onSerialLotBlur={onSerialLotBlur} />
      <CustomFieldsSection entityType={INVENTORY_ENTITY.repairOrder} values={customValues} onChange={setCustom} />
      <ChangeLogPanel targetType="inv_repair_order" targetId={effectiveEditing()?.id} />
      </div>
    </WideEntityModal>

    <SalesOrderLinePickerModal
      open={soPickerOpen()}
      onClose={() => setSoPickerOpen(false)}
      onConfirm={(picked) => applySalesOrderLines(picked)}
    />
    <QuotationLinePickerModal
      open={quotationPickerOpen()}
      onClose={() => setQuotationPickerOpen(false)}
      onConfirm={(picked: PickedQuotationLine[]) =>
        mapLinesOntoRepair(
          picked.map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            item_name: r.item_name,
            qty: r.balance_qty > 0 ? r.balance_qty : r.qty,
            remark: r.remark ?? r.description ?? "",
          })),
        )
      }
    />
    <PurchaseRequestLinePickerModal
      open={prPickerOpen()}
      onClose={() => setPrPickerOpen(false)}
      onConfirm={(picked: PickedPurchaseRequestLine[]) =>
        mapLinesOntoRepair(
          picked.map((r) => ({
            item_id: r.item_id,
            item_code: r.item_code,
            item_name: r.item_name,
            qty: r.balance_qty,
            remark: r.remark ?? r.description ?? "",
          })),
        )
      }
    />

    <QuickCustomerModal
      open={showNewCustomer()}
      initialName={newCustomerName()}
      onClose={() => setShowNewCustomer(false)}
      onCreated={(p) => {
        setPartnerId(p.id);
        setCustomerLabel(p.company_name);
      }}
    />

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
