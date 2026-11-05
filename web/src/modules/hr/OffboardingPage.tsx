import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo } from "../../shared/LookupCombo";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { fetchEmployeeOptions } from "../../shared/useHr";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";
import { HrPageHead } from "./HrUi";

type Clearance = { id: number; employee_name: string; employee_status: string; status: string; pay_period_id: number };

export default function OffboardingPage() {
  const toast = useToast();
  const [empId, setEmpId] = createSignal<number | null>(null);
  const [empLabel, setEmpLabel] = createSignal("");
  const [selected, setSelected] = createSignal<number | null>(null);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Clearance[]>("/api/v1/hr/clearances")).data ?? []);

  const save = async () => {
    if (!empId()) return toast.warning("Choose an employee.");
    const res = await apiFetch("/api/v1/hr/clearances", { method: "POST", body: JSON.stringify({ employee_id: empId() }) });
    if (!res.success) return toast.warning(res.message ?? "Could not save the clearance.");
    setEmpId(null);
    setEmpLabel("");
    void refetch();
  };

  const release = async (row: Clearance) => {
    if (row.status === "released") return;
    const res = await apiFetch(`/api/v1/hr/clearances/${row.id}/release`, { method: "POST", body: JSON.stringify({}) });
    if (!res.success) return toast.warning(res.message ?? "Could not release final pay.");
    void refetch();
  };

  return (
    <HrLayout>
      <HrPageHead title="Offboarding & clearance" subtitle="Release calls the existing final pay. Closing a resignation request does not." />
      <div class="mb-4 grid gap-3 rounded-xl border border-stroke bg-surface p-4 grid-cols-1 min-[1024px]:grid-cols-2">
        <LookupCombo label="Employee" value={empLabel} selectedId={empId} onInput={setEmpLabel} onSelect={(o) => { setEmpId(o.id); setEmpLabel(o.label); }} onClear={() => { setEmpId(null); setEmpLabel(""); }} fetchOptions={(q) => fetchEmployeeOptions(q)} placeholder="Search employees…" />
        <button type="button" class="self-end rounded-lg bg-brand-600 px-4 py-2 text-sm text-white" onClick={() => void save()}>Add clearance</button>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "employee_status", header: "Employment" },
          { key: "status", header: "Clearance" },
          { key: "pay_period_id", header: "Final pay", render: (row) => row.status === "released" ? String(row.pay_period_id || "") : <button type="button" class="text-sm text-brand-700" onClick={() => void release(row)}>Release final pay</button> },
        ]}
        rows={rows() ?? []}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => {}}
        showNew={false}
        codeKey="employee_name"
        nameKey="status"
      />
    </HrLayout>
  );
}
