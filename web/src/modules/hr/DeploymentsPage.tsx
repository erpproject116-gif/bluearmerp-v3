import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Assignment = {
  id: number;
  employee_name: string;
  employee_status: string;
  site_name: string;
  client_name: string;
  start_date: string;
  end_date: string;
};

export default function DeploymentsPage() {
  const toast = useToast();
  const [selected, setSelected] = createSignal<number | null>(null);
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Assignment[]>("/api/v1/hr/assignments")).data ?? []);

  const end = async (row: Assignment) => {
    if (row.end_date) return;
    const res = await apiFetch(`/api/v1/hr/assignments/${row.id}`, { method: "PATCH", body: JSON.stringify({}) });
    if (!res.success) return toast.warning(res.message ?? "Could not end the assignment.");
    const status = (res.data as { employee_status?: string } | undefined)?.employee_status;
    if (status && status !== row.employee_status) toast.warning("Employment status changed.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Roster</h1>
      <SpreadsheetGrid
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "client_name", header: "Client" },
          { key: "site_name", header: "Site" },
          { key: "start_date", header: "Start" },
          { key: "end_date", header: "End" },
          { key: "employee_status", header: "Employment", render: (row) => (
            <span class="flex items-center gap-2">
              <span>{row.employee_status}</span>
              {!row.end_date && <button type="button" class="text-sm text-brand-700" onClick={() => void end(row)}>End</button>}
            </span>
          ) },
        ]}
        rows={rows() ?? []}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => {}}
        showNew={false}
        codeKey="employee_name"
        nameKey="site_name"
      />
    </HrLayout>
  );
}
