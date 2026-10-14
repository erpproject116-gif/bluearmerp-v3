import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../shared/ModalFormGuide";
import { formatAmount } from "../../shared/money";
import {
  createEmployee,
  patchEmployee,
  useEmployees,
  useHrDepartments,
  useInvalidateEmployees,
  type Employee,
} from "../../shared/useHr";
import {
  downloadEmployeesImportTemplate,
  exportEmployeesCsv,
  importEmployeesCsv,
} from "../../shared/hrCsvImport";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY, HR_ENTITY, HR_SETTINGS_HREF } from "../../shared/entityTypes";
import { useMasterLifecycle } from "../../shared/masterLifecycle";
import { HrLayout } from "./HrLayout";
import { EmployeeExtrasPanel } from "./EmployeeExtrasPanel";
import { HrMappedImportModal } from "./HrMappedImportModal";
import { UserSearchModal, type UserSearchRow } from "../purchase-request/purchase-request/UserSearchModal";
import { buildRequiredChecks, useFormFieldSettings } from "../../shared/useFormFieldSettings";
import { requireFields } from "../../shared/handleSaveResult";
import { useQueryClient } from "@tanstack/solid-query";
import { apiBase, apiFetch, getAccessToken } from "../../shared/api";
import { CustomFieldsSection, validateCustomFields } from "../../shared/CustomFieldsSection";
import { flushStagedCustomFiles } from "../../shared/customFieldFiles";
import { useCustomValues } from "../../shared/useCustomValues";
import { getActiveBranchIdCurrent, getActiveTenantId } from "../../shared/activeContext";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { QuickDepartmentModal } from "../../shared/QuickDepartmentModal";
import { hasPermission, useAuth } from "../../shared/auth-context";

const STATUS_OPTIONS = ["active", "inactive", "terminated"];

const GOV_ID_UPLOADS = [
  { docType: "id_national", label: "National ID" },
  { docType: "id_philhealth", label: "PhilHealth ID" },
  { docType: "id_sss", label: "SSS ID" },
  { docType: "id_umid", label: "UMID" },
  { docType: "id_drivers_license", label: "Driver's License" },
  { docType: "id_passport", label: "Passport" },
  { docType: "id_tin", label: "TIN ID" },
  { docType: "id_pagibig", label: "Pag-IBIG ID" },
  { docType: "id_prc", label: "PRC ID" },
  { docType: "id_voter", label: "Voter's ID" },
  { docType: "id_postal", label: "Postal ID" },
  { docType: "id_senior", label: "Senior Citizen ID" },
  { docType: "id_pwd", label: "PWD ID" },
  { docType: "id_barangay", label: "Barangay ID" },
  { docType: "id_gov", label: "Other government ID" },
] as const;

type EmployeeDoc = { id: number; doc_type: string; title: string; file_name?: string; has_file?: boolean };

async function employeeDocHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const tenantId = getActiveTenantId();
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);
  const branchId = getActiveBranchIdCurrent();
  if (branchId) headers["X-Branch-ID"] = String(branchId);
  return headers;
}

async function uploadEmployeeDocument(employeeId: number, docType: string, file: File): Promise<boolean> {
  const headers = await employeeDocHeaders();
  const fd = new FormData();
  fd.append("file", file);
  fd.append("doc_type", docType);
  fd.append("title", file.name);
  const res = await fetch(`${apiBase}/api/v1/hr/employees/${employeeId}/documents`, {
    method: "POST",
    headers,
    body: fd,
  });
  if (!res.ok) return false;
  const body = (await res.json()) as { success?: boolean };
  return Boolean(body.success);
}

async function uploadEmployeePhoto(employeeId: number, file: File): Promise<boolean> {
  return uploadEmployeeDocument(employeeId, "photo", file);
}

async function loadStoredEmployeePhoto(employeeId: number): Promise<string | null> {
  const listed = await apiFetch<{ id: number; doc_type: string; has_file?: boolean }[]>(
    `/api/v1/hr/employees/${employeeId}/documents`,
  );
  const photo = (listed.data ?? []).find((doc) => doc.doc_type === "photo" && doc.has_file);
  if (!photo) return null;
  const res = await fetch(`${apiBase}/api/v1/hr/employees/${employeeId}/documents/${photo.id}/download`, {
    headers: await employeeDocHeaders(),
  });
  if (!res.ok) return null;
  return URL.createObjectURL(await res.blob());
}

export default function HrEmployeesPage() {
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize, setPageSize } = useListState("full_name");
  const auth = useAuth();
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [selected, setSelected] = createSignal<Employee | null>(null);
  const [employeeNo, setEmployeeNo] = createSignal("");
  const [fullName, setFullName] = createSignal("");
  const [departmentId, setDepartmentId] = createSignal<number | null>(null);
  const [department, setDepartment] = createSignal("");
  const [showQuickDept, setShowQuickDept] = createSignal(false);
  const [quickDeptName, setQuickDeptName] = createSignal("");
  const [jobTitle, setJobTitle] = createSignal("");
  const [hireDate, setHireDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = createSignal("active");
  const [baseSalary, setBaseSalary] = createSignal("");
  const [userId, setUserId] = createSignal<number | null>(null);
  const [userLabel, setUserLabel] = createSignal("");
  const [userSearchOpen, setUserSearchOpen] = createSignal(false);
  const [email, setEmail] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [tin, setTin] = createSignal("");
  const [sssNo, setSssNo] = createSignal("");
  const [philhealthNo, setPhilhealthNo] = createSignal("");
  const [pagibigNo, setPagibigNo] = createSignal("");
  const [taxStatus, setTaxStatus] = createSignal("S");
  const [bankName, setBankName] = createSignal("");
  const [bankAccountNo, setBankAccountNo] = createSignal("");
  const [birthdate, setBirthdate] = createSignal("");
  const [nationalId, setNationalId] = createSignal("");
  const [emergencyName, setEmergencyName] = createSignal("");
  const [emergencyAddress, setEmergencyAddress] = createSignal("");
  const [emergencyPhone, setEmergencyPhone] = createSignal("");
  const [photoFile, setPhotoFile] = createSignal<File | null>(null);
  const [employeeDocs, setEmployeeDocs] = createSignal<EmployeeDoc[]>([]);
  const [stagedGovIds, setStagedGovIds] = createSignal<Record<string, File>>({});
  const [photoPreviewUrl, setPhotoPreviewUrl] = createSignal<string | null>(null);
  const [storedPhotoUrl, setStoredPhotoUrl] = createSignal<string | null>(null);
  let previewObjectUrl: string | undefined;
  let storedObjectUrl: string | undefined;
  const [saving, setSaving] = createSignal(false);
  const [importing, setImporting] = createSignal(false);
  const [mappedImportOpen, setMappedImportOpen] = createSignal(false);
  const [formSection, setFormSection] = createSignal<"employment" | "statutory" | "documents">("employment");
  const toast = useToast();
  const invalidate = useInvalidateEmployees();
  const qc = useQueryClient();
  const depts = useHrDepartments();
  const { fields, activeCustomFields } = useFormFieldSettings(HR_ENTITY.employee);
  const { customValues, setCustom, loadCustom } = useCustomValues();

  const canWriteEmployees = () => hasPermission(auth.me, "hr.employees", "write");

  const chooseGovId = async (docType: string, file: File | null) => {
    if (!file) {
      setStagedGovIds((current) => {
        const next = { ...current };
        delete next[docType];
        return next;
      });
      return;
    }
    const id = selected()?.id;
    if (!id) {
      setStagedGovIds((current) => ({ ...current, [docType]: file }));
      return;
    }
    const uploaded = await uploadEmployeeDocument(id, docType, file);
    if (!uploaded) {
      toast.warning("Government ID upload failed.");
      return;
    }
    const listed = await apiFetch<EmployeeDoc[]>(`/api/v1/hr/employees/${id}/documents`);
    setEmployeeDocs(listed.data ?? []);
  };

  const viewEmployeeDoc = async (docId: number) => {
    const id = selected()?.id;
    if (!id) return;
    const res = await fetch(`${apiBase}/api/v1/hr/employees/${id}/documents/${docId}/download`, {
      headers: await employeeDocHeaders(),
    });
    if (!res.ok) {
      toast.warning("Could not open that ID file.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  createEffect(() => {
    const open = modalOpen();
    const file = photoFile();
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = undefined;
    }
    if (!open || !file) {
      setPhotoPreviewUrl(null);
      return;
    }
    previewObjectUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(previewObjectUrl);
  });

  createEffect(() => {
    const open = modalOpen();
    const id = selected()?.id;
    if (storedObjectUrl) {
      URL.revokeObjectURL(storedObjectUrl);
      storedObjectUrl = undefined;
    }
    setStoredPhotoUrl(null);
    setEmployeeDocs([]);
    if (!open || !id) return;
    let cancelled = false;
    void apiFetch<EmployeeDoc[]>(`/api/v1/hr/employees/${id}/documents`).then((listed) => {
      if (!cancelled) setEmployeeDocs(listed.data ?? []);
    });
    void loadStoredEmployeePhoto(id).then((url) => {
      if (cancelled || !url) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      storedObjectUrl = url;
      setStoredPhotoUrl(url);
    });
    onCleanup(() => {
      cancelled = true;
    });
  });

  onCleanup(() => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    if (storedObjectUrl) URL.revokeObjectURL(storedObjectUrl);
  });

  const lifecycle = useMasterLifecycle({
    apiBase: "/api/v1/hr/employees",
    entityLabel: "employee",
    canManage: () => canWriteEmployees(),
    onChanged: invalidate,
  });

  const list = useEmployees(() => ({
    page: page(),
    pageSize: pageSize(),
    q: q() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const fetchDepartments = async (query: string): Promise<LookupOption[]> => {
    const needle = query.trim().toLowerCase();
    return (depts.data ?? [])
      .filter((d) => d.status === "active")
      .filter((d) => !needle || d.department_name.toLowerCase().includes(needle))
      .map((d) => ({ id: d.id, label: d.department_name }));
  };

  const resetForm = () => {
    setEmployeeNo("");
    setFullName("");
    setDepartmentId(null);
    setDepartment("");
    setQuickDeptName("");
    setJobTitle("");
    setHireDate(new Date().toISOString().slice(0, 10));
    setStatus("active");
    setBaseSalary("");
    setUserId(null);
    setUserLabel("");
    setEmail("");
    setNotes("");
    setTin("");
    setSssNo("");
    setPhilhealthNo("");
    setPagibigNo("");
    setTaxStatus("S");
    setBankName("");
    setBankAccountNo("");
    setBirthdate("");
    setNationalId("");
    setEmergencyName("");
    setEmergencyAddress("");
    setEmergencyPhone("");
    setPhotoFile(null);
    setStagedGovIds({});
    setEmployeeDocs([]);
    loadCustom({});
  };

  const openNew = () => {
    setSelected(null);
    resetForm();
    setFormSection("employment");
    setModalOpen(true);
  };

  const openEdit = (row: Employee) => {
    setSelected(row);
    setEmployeeNo(row.employee_no);
    setFullName(row.full_name);
    setDepartmentId(row.department_id ?? null);
    setDepartment(row.department);
    setJobTitle(row.job_title);
    setHireDate(row.hire_date);
    setStatus(row.status);
    setBaseSalary(String(row.base_salary));
    setUserId(row.user_id ?? null);
    setUserLabel(row.user_id ? `User #${row.user_id}` : "");
    setEmail(row.email ?? "");
    setNotes(row.notes ?? "");
    setTin(row.tin ?? "");
    setSssNo(row.sss_no ?? "");
    setPhilhealthNo(row.philhealth_no ?? "");
    setPagibigNo(row.pagibig_no ?? "");
    setTaxStatus(row.tax_status || "S");
    setBankName(row.bank_name ?? "");
    setBankAccountNo(row.bank_account_no ?? "");
    setBirthdate(row.birthdate ?? "");
    setNationalId(row.national_id ?? "");
    setEmergencyName(row.emergency_contact_name ?? "");
    setEmergencyAddress(row.emergency_contact_address ?? "");
    setEmergencyPhone(row.emergency_contact_phone ?? "");
    setPhotoFile(null);
    loadCustom(row.custom_values ?? {});
    setFormSection("employment");
    setModalOpen(true);
    void apiFetch<Employee>(`/api/v1/hr/employees/${row.id}`).then((res) => {
      if (res.success && res.data) loadCustom(res.data.custom_values ?? {});
    });
  };

  const buildDraftPayload = () => ({
    employee_no: employeeNo(),
    full_name: fullName(),
    department_id: departmentId(),
    department: department(),
    job_title: jobTitle(),
    hire_date: hireDate(),
    status: status(),
    base_salary: baseSalary(),
    user_id: userId(),
    user_label: userLabel(),
    email: email(),
    notes: notes(),
    tin: tin(),
    sss_no: sssNo(),
    philhealth_no: philhealthNo(),
    pagibig_no: pagibigNo(),
    tax_status: taxStatus(),
    bank_name: bankName(),
    bank_account_no: bankAccountNo(),
    birthdate: birthdate(),
    national_id: nationalId(),
    emergency_contact_name: emergencyName(),
    emergency_contact_address: emergencyAddress(),
    emergency_contact_phone: emergencyPhone(),
    custom_values: customValues(),
  });

  const applyDraftPayload = (payload: ReturnType<typeof buildDraftPayload>) => {
    setEmployeeNo(payload.employee_no);
    setFullName(payload.full_name);
    setDepartmentId(payload.department_id);
    setDepartment(payload.department);
    setJobTitle(payload.job_title);
    setHireDate(payload.hire_date);
    setStatus(payload.status);
    setBaseSalary(payload.base_salary);
    setUserId(payload.user_id);
    setUserLabel(payload.user_label);
    setEmail(payload.email);
    setNotes(payload.notes);
    setTin(payload.tin);
    setSssNo(payload.sss_no);
    setPhilhealthNo(payload.philhealth_no);
    setPagibigNo(payload.pagibig_no);
    setTaxStatus(payload.tax_status);
    setBankName(payload.bank_name);
    setBankAccountNo(payload.bank_account_no);
    setBirthdate(payload.birthdate);
    setNationalId(payload.national_id);
    setEmergencyName(payload.emergency_contact_name);
    setEmergencyAddress(payload.emergency_contact_address);
    setEmergencyPhone(payload.emergency_contact_phone);
    loadCustom(payload.custom_values ?? {});
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.hrEmployee,
    draftKey: () => (selected() ? `edit-${selected()!.id}` : "new"),
    getPayload: buildDraftPayload,
    onApply: applyDraftPayload,
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !selected(),
  });

  const onSelectUser = (row: UserSearchRow) => {
    setUserId(row.id);
    setUserLabel(`${row.full_name}${row.email ? ` (${row.email})` : ""}`);
    setUserSearchOpen(false);
  };

  const save = async () => {
    const formValues = {
      employee_no: employeeNo(),
      full_name: fullName(),
      department_id: departmentId(),
      job_title: jobTitle(),
      hire_date: hireDate(),
      status: status(),
      base_salary: baseSalary(),
      user_id: userId(),
      email: email(),
      bank_name: bankName(),
      bank_account_no: bankAccountNo(),
      tin: tin(),
      sss_no: sssNo(),
      philhealth_no: philhealthNo(),
      pagibig_no: pagibigNo(),
      tax_status: taxStatus(),
      notes: notes(),
    };
    const clientError = requireFields(formValues as Record<string, unknown>, buildRequiredChecks(fields()))
      ?? validateCustomFields(customValues(), activeCustomFields());
    if (clientError) {
      toast.warning(clientError);
      return;
    }
    if (!fullName().trim()) {
      toast.warning("Full name is required.");
      return;
    }
    setSaving(true);
    const dept = (depts.data ?? []).find((d) => d.id === departmentId());
    const body = {
      employee_no: employeeNo().trim(),
      full_name: fullName().trim(),
      department: dept?.department_name ?? department().trim(),
      department_id: departmentId() || undefined,
      job_title: jobTitle().trim(),
      hire_date: hireDate(),
      status: status(),
      base_salary: Number(baseSalary()) || 0,
      user_id: userId() && userId()! > 0 ? userId() : selected() ? 0 : undefined,
      email: email().trim() || undefined,
      notes: notes().trim() || undefined,
      tin: tin().trim() || undefined,
      sss_no: sssNo().trim() || undefined,
      philhealth_no: philhealthNo().trim() || undefined,
      pagibig_no: pagibigNo().trim() || undefined,
      tax_status: taxStatus(),
      bank_name: bankName().trim() || undefined,
      bank_account_no: bankAccountNo().trim() || undefined,
      birthdate: birthdate(),
      national_id: nationalId().trim(),
      emergency_contact_name: emergencyName().trim(),
      emergency_contact_address: emergencyAddress().trim(),
      emergency_contact_phone: emergencyPhone().trim(),
      custom_values: customValues(),
    };
    const row = selected();
    const res = row ? await patchEmployee(row.id, body) : await createEmployee(body);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save employee.");
      return;
    }
    await draft.clearOnSave();
    const savedId = row?.id ?? (res.data as Employee | undefined)?.id;
    const file = photoFile();
    if (savedId && file) {
      const uploaded = await uploadEmployeePhoto(savedId, file);
      setPhotoFile(null);
      if (!uploaded) toast.warning("Employee saved, but the photo upload failed.");
    }
    if (savedId) {
      const pendingIds = stagedGovIds();
      let idFailed = false;
      for (const item of GOV_ID_UPLOADS) {
        const chosen = pendingIds[item.docType];
        if (!chosen) continue;
        const uploaded = await uploadEmployeeDocument(savedId, item.docType, chosen);
        if (!uploaded) idFailed = true;
      }
      setStagedGovIds({});
      if (idFailed) toast.warning("Employee saved, but a government ID upload failed.");
      const filesStored = await flushStagedCustomFiles(HR_ENTITY.employee, savedId);
      for (const [key, value] of Object.entries(filesStored.saved)) setCustom(key, value);
      if (!filesStored.ok) toast.warning("Employee saved, but a custom field file upload failed.");
    }
    if (!row && res.data) {
      setSelected(res.data as Employee);
      setFormSection("documents");
      toast.success("Employee saved. You can upload 201 documents now.");
      invalidate();
      return;
    }
    setModalOpen(false);
    invalidate();
  };

  const onImportFile = async (file: File) => {
    setImporting(true);
    try {
      const result = await importEmployeesCsv(file);
      if (!result.ok || !result.data) {
        toast.error(result.message ?? "Import failed.");
        return;
      }
      const { created, updated = 0, failed, row_errors: rowErrors } = result.data;
      if (failed > 0) {
        const detail =
          rowErrors
            ?.slice(0, 6)
            .map((e) => `Row ${e.row}: ${e.message}`)
            .join(" · ") ?? "";
        toast.warning(`Imported ${created}, updated ${updated}; ${failed} failed.${detail ? ` ${detail}` : ""}`);
      } else {
        toast.success(`Imported ${created}, updated ${updated} employee(s).`);
      }
      if (created > 0 || updated > 0) invalidate();
    } catch {
      toast.error("Import failed.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <HrLayout>
      <div class="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
          onClick={() => void downloadEmployeesImportTemplate().catch(() => toast.error("Could not download template."))}
        >
          Download template
        </button>
        <label class="cursor-pointer rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel">
          {importing() ? "Importing…" : "Import CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            class="hidden"
            disabled={importing()}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (f) void onImportFile(f);
            }}
          />
        </label>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
          onClick={() => setMappedImportOpen(true)}
        >
          Import with mapping…
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:erp-panel"
          onClick={() =>
            void exportEmployeesCsv(q() || undefined).catch(() => toast.error("Export failed."))
          }
        >
          Export CSV
        </button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "employee_no", header: "Employee #", clickable: true },
          { key: "full_name", header: "Name" },
          { key: "department", header: "Department" },
          { key: "job_title", header: "Job title" },
          { key: "status", header: "Status" },
          {
            key: "base_salary",
            header: "Base salary",
            render: (r) => <span>{formatAmount(r.base_salary)}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="employee_no"
        nameKey="full_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search employees…"
        settingsHref={HR_SETTINGS_HREF.employee}
        toolbarExtra={
          <div class="flex flex-wrap items-end gap-2">
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
      />
      <lifecycle.BulkDialog />
      <EntityModal
        open={modalOpen()}
        title={selected() ? "Edit employee" : "New employee"}
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <ModalFormGuide guideId="hr_employee" spanFull />
        <draft.DraftBanner />
        <div class="col-span-full mb-2 flex flex-wrap gap-1 border-b border-stroke pb-2">
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium"
            classList={{
              "bg-brand-600 text-white": formSection() === "employment",
              "text-text-secondary hover:bg-slate-50": formSection() !== "employment",
            }}
            onClick={() => setFormSection("employment")}
          >
            Employment
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium"
            classList={{
              "bg-brand-600 text-white": formSection() === "statutory",
              "text-text-secondary hover:bg-slate-50": formSection() !== "statutory",
            }}
            onClick={() => setFormSection("statutory")}
          >
            201 — statutory
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-40"
            classList={{
              "bg-brand-600 text-white": formSection() === "documents",
              "text-text-secondary hover:bg-slate-50": formSection() !== "documents",
            }}
            disabled={!selected()?.id}
            onClick={() => setFormSection("documents")}
          >
            201 — documents
          </button>
        </div>

        <Show when={formSection() === "employment"}>
          <Show when={!selected()}>
            <Field label="Employee #">
              <input class={inputClass} value={employeeNo()} onInput={(e) => setEmployeeNo(e.currentTarget.value)} />
            </Field>
          </Show>
          <Field label="Full name *">
            <input class={inputClass} value={fullName()} onInput={(e) => setFullName(e.currentTarget.value)} />
          </Field>
          <LookupCombo
            label="Department"
            value={department}
            selectedId={departmentId}
            onInput={setDepartment}
            onSelect={(o) => {
              setDepartmentId(o.id);
              setDepartment(o.label);
            }}
            onClear={() => {
              setDepartmentId(null);
              setDepartment("");
            }}
            fetchOptions={fetchDepartments}
            placeholder="Search departments…"
            createLabel="Add department"
            onCreate={
              canWriteEmployees()
                ? (query) => {
                    setQuickDeptName(query);
                    setShowQuickDept(true);
                  }
                : undefined
            }
          />
          <Field label="Job title">
            <input class={inputClass} value={jobTitle()} onInput={(e) => setJobTitle(e.currentTarget.value)} />
          </Field>
          <Field label="Hire date">
            <input type="date" class={inputClass} value={hireDate()} onInput={(e) => setHireDate(e.currentTarget.value)} />
          </Field>
          <Field label="Birthdate">
            <input type="date" class={inputClass} value={birthdate()} onInput={(e) => setBirthdate(e.currentTarget.value)} />
          </Field>
          <Field label="National ID">
            <input class={inputClass} value={nationalId()} onInput={(e) => setNationalId(e.currentTarget.value)} />
          </Field>
          <div class="col-span-full rounded-lg border border-dashed border-stroke p-3">
            <h3 class="text-sm font-semibold text-text-primary">Government ID copies</h3>
            <p class="mb-3 text-xs text-text-secondary">Optional. The ID number can be saved without a scan.</p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <For each={GOV_ID_UPLOADS}>
                {(item) => {
                  const stored = () => employeeDocs().find((doc) => doc.doc_type === item.docType && doc.has_file);
                  const staged = () => stagedGovIds()[item.docType];
                  return (
                    <label class="block">
                      <span class="mb-1 block text-sm font-medium text-text-primary">{item.label}</span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        class={inputClass}
                        onChange={(e) => void chooseGovId(item.docType, e.currentTarget.files?.[0] ?? null)}
                      />
                      <Show when={staged() || stored()}>
                        <span class="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                          <span>{staged()?.name || stored()?.file_name || stored()?.title}</span>
                          <Show when={stored()}>
                            <button
                              type="button"
                              class="font-medium text-brand-700 hover:underline"
                              onClick={(e) => {
                                e.preventDefault();
                                void viewEmployeeDoc(stored()!.id);
                              }}
                            >
                              View
                            </button>
                          </Show>
                        </span>
                      </Show>
                    </label>
                  );
                }}
              </For>
            </div>
          </div>
          <Field label="Emergency contact">
            <input class={inputClass} value={emergencyName()} onInput={(e) => setEmergencyName(e.currentTarget.value)} />
          </Field>
          <Field label="Emergency address">
            <input class={inputClass} value={emergencyAddress()} onInput={(e) => setEmergencyAddress(e.currentTarget.value)} />
          </Field>
          <Field label="Emergency phone">
            <input class={inputClass} value={emergencyPhone()} onInput={(e) => setEmergencyPhone(e.currentTarget.value)} />
          </Field>
          <Field label="Photo">
            <input
              type="file"
              accept="image/*"
              class={inputClass}
              onChange={(e) => setPhotoFile(e.currentTarget.files?.[0] ?? null)}
            />
            <Show when={photoPreviewUrl() || storedPhotoUrl()}>
              <img
                src={photoPreviewUrl() || storedPhotoUrl() || ""}
                alt="Employee photo"
                class="mt-2 h-24 w-24 rounded-lg object-cover"
              />
            </Show>
          </Field>
          <Field label="Status">
            <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
              <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s}</option>}</For>
            </select>
          </Field>
          <Field label="Base salary">
            <input type="number" min="0" step="0.01" class={inputClass} value={baseSalary()} onInput={(e) => setBaseSalary(e.currentTarget.value)} />
          </Field>
          <Field label="ESS login user">
            <div class="flex flex-wrap items-center gap-2">
              <input class={`${inputClass} flex-1`} readOnly value={userLabel()} placeholder="Link a login user for My HR (ESS)…" />
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setUserSearchOpen(true)}>
                Search
              </button>
              <Show when={userId()}>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-red-600"
                  onClick={() => {
                    setUserId(null);
                    setUserLabel("");
                  }}
                >
                  Clear
                </button>
              </Show>
            </div>
            <p class="mt-1 text-[11px] text-text-secondary">Required for the employee to see payslips under My HR (ESS).</p>
          </Field>
          <Field label="Email">
            <input type="email" class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          </Field>
          <Field label="Notes">
            <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
          </Field>
        </Show>

        <Show when={formSection() === "statutory"}>
          <Field label="Bank name">
            <input class={inputClass} value={bankName()} onInput={(e) => setBankName(e.currentTarget.value)} />
          </Field>
          <Field label="Bank account no.">
            <input class={inputClass} value={bankAccountNo()} onInput={(e) => setBankAccountNo(e.currentTarget.value)} />
          </Field>
          <Field label="TIN">
            <input class={inputClass} value={tin()} onInput={(e) => setTin(e.currentTarget.value)} />
          </Field>
          <Field label="SSS number">
            <input class={inputClass} value={sssNo()} onInput={(e) => setSssNo(e.currentTarget.value)} />
          </Field>
          <Field label="PhilHealth number">
            <input class={inputClass} value={philhealthNo()} onInput={(e) => setPhilhealthNo(e.currentTarget.value)} />
          </Field>
          <Field label="Pag-IBIG number">
            <input class={inputClass} value={pagibigNo()} onInput={(e) => setPagibigNo(e.currentTarget.value)} />
          </Field>
          <Field label="Tax status">
            <select class={inputClass} value={taxStatus()} onChange={(e) => setTaxStatus(e.currentTarget.value)}>
              <For each={["S", "ME", "S1", "S2", "S3", "S4", "ME1", "ME2", "ME3", "ME4", "Z"]}>
                {(s) => <option value={s}>{s}</option>}
              </For>
            </select>
          </Field>
        </Show>

        <Show when={formSection() === "documents" && selected()?.id}>
          {(id) => <EmployeeExtrasPanel employeeId={id()} />}
        </Show>
        <CustomFieldsSection
          entityType={HR_ENTITY.employee}
          recordId={() => selected()?.id}
          values={customValues}
          onChange={setCustom}
        />
      </EntityModal>
      <UserSearchModal open={userSearchOpen()} onClose={() => setUserSearchOpen(false)} onSelect={onSelectUser} />
      <HrMappedImportModal
        open={mappedImportOpen()}
        kind="employees"
        onClose={() => setMappedImportOpen(false)}
        onImported={() => invalidate()}
      />
      <QuickDepartmentModal
        open={showQuickDept()}
        initialName={quickDeptName()}
        onClose={() => setShowQuickDept(false)}
        onCreated={(dept) => {
          setDepartmentId(dept.id);
          setDepartment(dept.department_name);
          void qc.invalidateQueries({ queryKey: ["hr-departments"] });
          toast.success("Department added.");
        }}
      />
    </HrLayout>
  );
}
