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

const KIND_FILTERS = [
  ["", "All requests"],
  ["loan", "Loans"],
  ["salary_advance", "Salary advances"],
  ["pay_question", "Pay questions"],
  ["certificate", "Certificates"],
  ["resignation", "Resignations"],
] as const;

const STATUS_FILTERS = [
  ["", "All"],
  ["pending", "Pending"],
  ["closed", "Closed"],
] as const;

export default function RequestsPage() {
  const toast = useToast();
  const [kind, setKind] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [requests, { refetch }] = createResource(
    () => `${kind()}|${status()}`,
    async () => {
      const q = new URLSearchParams();
      if (kind()) q.set("kind", kind());
      if (status()) q.set("status", status());
      const res = await apiFetch<RequestRow[]>(`/api/v1/hr/worker-requests?${q}`);
      return res.data ?? [];
    },
  );
  const rows = createMemo(() => requests() ?? []);

  const close = async (row: RequestRow) => {
    const res = await apiFetch(`/api/v1/hr/worker-requests/${row.id}`, { method: "PATCH", body: "{}" });
    if (!res.success) return toast.warning(res.message ?? "Could not close the request.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="text-2xl font-semibold">Requests</h1>
      <p class="mb-4 mt-1 text-sm text-text-secondary">Loans, salary advances, pay questions, certificates, and resignations. Leave stays on the Leave page. These requests do not change pay.</p>
      <label class="mb-3 block text-sm">
        Kind
        <select class="ml-2 rounded border border-stroke px-2 py-1" value={kind()} onChange={(e) => setKind(e.currentTarget.value)}>
          {KIND_FILTERS.map(([value, label]) => <option value={value}>{label}</option>)}
        </select>
      </label>
      <SpreadsheetGrid
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "kind", header: "Kind" },
          { key: "status", header: "Status" },
          { key: "details", header: "Details" },
          { key: "created_at", header: "Submitted" },
          { key: "id", header: "", render: (row) => <button type="button" class="text-sm text-brand-700" onClick={() => void close(row)}>Close</button> },
        ]}
        rows={rows()}
        loading={requests.loading}
        selectedId={null}
        onSelect={() => {}}
        onEdit={() => {}}
        onNew={() => {}}
        showNew={false}
        codeKey="employee_name"
        nameKey="kind"
        status={status()}
        onStatusChange={setStatus}
        statusOptions={STATUS_FILTERS.map(([value, label]) => ({ value, label }))}
      />
    </HrLayout>
  );
}
