import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { HrLayout } from "./HrLayout";

type Doc = { id: number; employee_name: string; doc_type: string; title: string; expires_on: string; late: boolean; client_visible?: boolean };

export default function CompliancePage() {
  const toast = useToast();
  const [selected, setSelected] = createSignal<number | null>(null);
  const [dates, setDates] = createSignal<Record<number, string>>({});
  const [rows, { refetch }] = createResource(async () => (await apiFetch<Doc[]>("/api/v1/hr/compliance-documents")).data ?? []);

  const save = async (row: Doc) => {
    const res = await apiFetch(`/api/v1/hr/employee-documents/${row.id}/expiry`, {
      method: "PATCH",
      body: JSON.stringify({ expires_on: dates()[row.id] ?? row.expires_on }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not save the expiry.");
    void refetch();
  };

  const showToClient = async (row: Doc) => {
    const res = await apiFetch(`/api/v1/hr/employee-documents/${row.id}/visibility`, {
      method: "PATCH",
      body: JSON.stringify({ client_visible: !row.client_visible }),
    });
    if (!res.success) return toast.warning(res.message ?? "Could not update visibility.");
    void refetch();
  };

  return (
    <HrLayout>
      <h1 class="mb-1 text-2xl font-semibold">Compliance & documents</h1>
      <p class="mb-4 text-sm text-text-secondary">Document dates on the employee file. Showing a document to a client does not send the file.</p>
      <SpreadsheetGrid
        columns={[
          { key: "employee_name", header: "Employee" },
          { key: "doc_type", header: "Type" },
          { key: "title", header: "Title" },
          { key: "expires_on", header: "Expires", render: (row) => (
            <span class="flex items-center gap-2">
              <input type="date" class={inputClass} value={dates()[row.id] ?? row.expires_on} onInput={(e) => setDates({ ...dates(), [row.id]: e.currentTarget.value })} />
              <button type="button" class="text-sm text-brand-700" onClick={() => void save(row)}>Save</button>
            </span>
          ) },
          { key: "late", header: "Late", render: (row) => row.late ? "Late" : "" },
          { key: "client_visible", header: "Client", render: (row) => (
            <button type="button" class="text-sm text-brand-700" onClick={() => void showToClient(row)}>{row.client_visible ? "Visible" : "Hidden"}</button>
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
        nameKey="title"
      />
    </HrLayout>
  );
}
