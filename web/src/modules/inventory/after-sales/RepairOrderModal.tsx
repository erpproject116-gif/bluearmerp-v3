import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { CustomFieldsSection, validateCustomFields } from "../../../shared/CustomFieldsSection";
import { EditableLineGrid, emptyLine, type RepairLineRow } from "../../../shared/EditableLineGrid";
import { INVENTORY_ENTITY } from "../../../shared/entityTypes";
import { requireFields, submitEntity } from "../../../shared/handleSaveResult";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import {
  formatFileSize,
  listRepairOrderAttachments,
  uploadRepairOrderAttachment,
  type RepairOrderAttachment,
} from "../../../shared/repairOrderAttachments";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { useCustomValues } from "../../../shared/useCustomValues";
import { buildRequiredChecks, useFormFieldSettings } from "../../../shared/useFormFieldSettings";
import { WideEntityModal } from "../../../shared/WideEntityModal";

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
  const { customValues, setCustom, loadCustom } = useCustomValues();
  const { fields, activeCustomFields } = useFormFieldSettings(INVENTORY_ENTITY.repairOrder);

  const [saving, setSaving] = createSignal(false);
  const [orderDate, setOrderDate] = createSignal(todayISO());
  const [dateNoDisplay, setDateNoDisplay] = createSignal("");
  const [repairOrderNo, setRepairOrderNo] = createSignal("");
  const [partnerId, setPartnerId] = createSignal<number | null>(null);
  const [customerLabel, setCustomerLabel] = createSignal("");
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
    if (!props.open) return;
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
      setProgressStatus(ed.progress_status);
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
    progress_status: progressStatus(),
  });

  const save = async () => {
    if (!partnerId()) {
      toast.warning("Please select a customer.");
      return;
    }
    if (!locationId()) {
      toast.warning("Please select a location.");
      return;
    }
    const clientError =
      requireFields(formValues() as Record<string, unknown>, buildRequiredChecks(fields())) ??
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
      progress_status: progressStatus(),
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
    const ed = props.editing;
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/inventory/repair-orders/${ed.id}`, { method: "PATCH", body: JSON.stringify(body) })
          : apiFetch("/api/v1/inventory/repair-orders", { method: "POST", body: JSON.stringify(body) }),
      toast,
      ed ? "Repair order updated." : "Repair order created.",
    );
    setSaving(false);
    if (!ok) return;
    props.onSaved();
    props.onClose();
  };

  return (
    <WideEntityModal
      open={props.open}
      title={props.editing ? "Edit Repair Order" : "New Repair Order"}
      onClose={() => props.onClose()}
      onSave={() => void save()}
      saving={saving()}
    >
      <Field label="Date-no">
        <input class={inputClass} value={dateNoDisplay()} readOnly />
      </Field>
      <Field label="Repair Order No.">
        <input class={inputClass} value={repairOrderNo()} readOnly />
      </Field>
      <Field label="Date *">
        <input type="date" class={inputClass} value={orderDate()} onInput={(e) => setOrderDate(e.currentTarget.value)} />
      </Field>
      <LookupCombo
        label="Customer"
        required
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
      />
      <LookupCombo
        label="PIC (Person-In-Charge)"
        value={picName}
        selectedId={picUserId}
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
      <LookupCombo
        label="Location"
        required
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
      />
      <Field label="Progress status">
        <select class={inputClass} value={progressStatus()} onChange={(e) => setProgressStatus(e.currentTarget.value)}>
          <option value="received">Received</option>
          <option value="finished">Finished</option>
        </select>
      </Field>
      <Field label="Scheduled completion date">
        <input type="date" class={inputClass} value={scheduledDate()} onInput={(e) => setScheduledDate(e.currentTarget.value)} />
      </Field>
      <Field label="Latest update" span="full">
        <textarea class={inputClass} rows={2} value={latestUpdate()} onInput={(e) => setLatestUpdate(e.currentTarget.value)} />
      </Field>
      <Field label="Repair details" span="full">
        <textarea class={inputClass} rows={2} value={repairDetails()} onInput={(e) => setRepairDetails(e.currentTarget.value)} />
      </Field>
      <div class="col-span-full rounded-lg border border-stroke bg-slate-50 px-4 py-3">
        <div class="mb-2 flex items-center justify-between">
          <span class="text-sm font-medium text-text-primary">Attachments</span>
          <Show when={props.editing}>
            <label class="cursor-pointer rounded border border-stroke bg-white px-3 py-1 text-sm hover:bg-slate-50">
              {uploading() ? "Uploading…" : "Upload file"}
              <input
                type="file"
                class="hidden"
                disabled={uploading()}
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  const orderId = props.editing?.id;
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
          when={props.editing}
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
      <LookupCombo
        label="Project"
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
      <Field label="Project name">
        <input class={inputClass} value={projectName()} onInput={(e) => setProjectName(e.currentTarget.value)} />
      </Field>
      <Field label="Technician">
        <input class={inputClass} value={technicianName()} onInput={(e) => setTechnicianName(e.currentTarget.value)} />
      </Field>
      <EditableLineGrid lines={lines} onChange={setLines} />
      <CustomFieldsSection entityType={INVENTORY_ENTITY.repairOrder} values={customValues} onChange={setCustom} />
    </WideEntityModal>
  );
}
