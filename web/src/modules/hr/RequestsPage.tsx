import { createMemo, createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type RequestRow = {
  id: number;
  employee_name: string;
  kind: string;
  status: string;
  details: string;
  created_at: string;
};

const FILTERS = [
  ["", "All requests"],
  ["loan", "Loans"],
  ["salary_advance", "Salary advances"],
  ["pay_question", "Pay questions"],
  ["certificate", "Certificates"],
  ["resignation", "Resignations"],
] as const;

export default function RequestsPage() {
  const toast = useToast();
  const [kind, setKind] = createSignal("");
  const [requests, { refetch }] = createResource(kind, async (value) => {
    const res = await apiFetch<RequestRow[]>(`/api/v1/hr/worker-requests${value ? `?kind=${value}` : ""}`);
    return res.data ?? [];
  });
  const rows = createMemo(() => requests() ?? []);

  const close = async (row: RequestRow) => {
    const res = await apiFetch(`/api/v1/hr/worker-requests/${row.id}`, { method: "PATCH", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Could not close the request.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Requests</h1>
      <label class="mb-3 block text-sm">
        Kind
        <select class="ml-2 rounded border border-stroke px-2 py-1" value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
          {FILTERS.map(([value, label]) => <option value={value}>{label}</option>)}
        </select>
      </label>
      <SpreadsheetGrid
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "kind", header: "Kind" },
          { key: "status", header: "Status" },
          { key: "details", header: "Details" },
          { key: "created_at", header: "Submitted" },
        ]}
        rows={rows()}
        loading={requests.loading}
        selectedId={null}
        onSelect={() => {}}
        onEdit={(row) => void close(row)}
        onNew={() => {}}
        showNew={false}
        codeKey="employee_name"
        nameKey="kind"
        status={kind()}
        onStatusChange={setKind}
        statusOptions={FILTERS.map(([value, label]) => ({ value, label }))}
      />
    </HrLayout>
  );
}
