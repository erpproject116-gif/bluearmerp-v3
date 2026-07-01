import { createSignal, For, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import {
  createEmployee,
  patchEmployee,
  useEmployees,
  useInvalidateEmployees,
  type Employee,
} from "../../shared/useHr";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

const STATUS_OPTIONS = ["active", "inactive", "terminated"];

export default function HrEmployeesPage() {
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("full_name");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [selected, setSelected] = createSignal<Employee | null>(null);
  const [employeeNo, setEmployeeNo] = createSignal("");
  const [fullName, setFullName] = createSignal("");
  const [department, setDepartment] = createSignal("");
  const [jobTitle, setJobTitle] = createSignal("");
  const [hireDate, setHireDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = createSignal("active");
  const [baseSalary, setBaseSalary] = createSignal("");
  const [email, setEmail] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const invalidate = useInvalidateEmployees();

  const list = useEmployees(() => ({ page: page(), pageSize, q: q() || undefined }));

  const openNew = () => {
    setSelected(null);
    setEmployeeNo("");
    setFullName("");
    setDepartment("");
    setJobTitle("");
    setHireDate(new Date().toISOString().slice(0, 10));
    setStatus("active");
    setBaseSalary("");
    setEmail("");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (row: Employee) => {
    setSelected(row);
    setEmployeeNo(row.employee_no);
    setFullName(row.full_name);
    setDepartment(row.department);
    setJobTitle(row.job_title);
    setHireDate(row.hire_date);
    setStatus(row.status);
    setBaseSalary(String(row.base_salary));
    setEmail(row.email ?? "");
    setNotes(row.notes ?? "");
    setModalOpen(true);
  };

  const save = async () => {
    if (!fullName().trim()) {
      toast.warning("Full name is required.");
      return;
    }
    setSaving(true);
    const body = {
      employee_no: employeeNo().trim(),
      full_name: fullName().trim(),
      department: department().trim(),
      job_title: jobTitle().trim(),
      hire_date: hireDate(),
      status: status(),
      base_salary: Number(baseSalary()) || 0,
      email: email().trim() || undefined,
      notes: notes().trim() || undefined,
    };
    const row = selected();
    const res = row ? await patchEmployee(row.id, body) : await createEmployee(body);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save employee.");
      return;
    }
    setModalOpen(false);
    invalidate();
  };

  return (
    <HrLayout>
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
            render: (r) => <span>{r.base_salary.toFixed(2)}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="employee_no"
        nameKey="full_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search employees…"
      />
      <EntityModal
        open={modalOpen()}
        title={selected() ? "Edit employee" : "New employee"}
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <Show when={!selected()}>
          <Field label="Employee #">
            <input class={inputClass} value={employeeNo()} onInput={(e) => setEmployeeNo(e.currentTarget.value)} />
          </Field>
        </Show>
        <Field label="Full name">
          <input class={inputClass} value={fullName()} onInput={(e) => setFullName(e.currentTarget.value)} />
        </Field>
        <Field label="Department">
          <input class={inputClass} value={department()} onInput={(e) => setDepartment(e.currentTarget.value)} />
        </Field>
        <Field label="Job title">
          <input class={inputClass} value={jobTitle()} onInput={(e) => setJobTitle(e.currentTarget.value)} />
        </Field>
        <Field label="Hire date">
          <input type="date" class={inputClass} value={hireDate()} onInput={(e) => setHireDate(e.currentTarget.value)} />
        </Field>
        <Field label="Status">
          <select class={inputClass} value={status()} onChange={(e) => setStatus(e.currentTarget.value)}>
            <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s}</option>}</For>
          </select>
        </Field>
        <Field label="Base salary">
          <input type="number" min="0" step="0.01" class={inputClass} value={baseSalary()} onInput={(e) => setBaseSalary(e.currentTarget.value)} />
        </Field>
        <Field label="Email">
          <input type="email" class={inputClass} value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </HrLayout>
  );
}
