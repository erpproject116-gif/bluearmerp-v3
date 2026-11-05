import { createResource, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { Field, inputClass, SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { HrLayout } from "./HrLayout";

type Row = { employee_no: string; employee_name: string; tin: string; withholding: number };

export default function GovernmentReportsPage() {
  const [year, setYear] = createSignal(String(new Date().getFullYear()));
  const [selected, setSelected] = createSignal<number | null>(null);
  const [rows] = createResource(year, async (value) => {
    if (!/^\d{4}$/.test(value)) return [];
    const data = (await apiFetch<Row[]>(`/api/v1/hr/government-reports/withholding?year=${value}`)).data ?? [];
    return data.map((row, index) => ({ ...row, id: index + 1 }));
  });

  return (
    <HrLayout>
      <h1 class="mb-4 text-2xl font-semibold">Government reports</h1>
      <p class="mb-3 text-sm text-text-secondary">Withholding already stored on payslips. Remittance files stay on the Remittances page. This is not a second 13th-month calculation. Sample withholding is in 2099.</p>
      <div class="mb-4 max-w-xs">
        <Field label="Year"><input class={inputClass} value={year()} onInput={(e) => setYear(e.currentTarget.value)} /></Field>
      </div>
      <SpreadsheetGrid
        columns={[
          { key: "employee_no", header: "Employee no." },
          { key: "employee_name", header: "Employee" },
          { key: "tin", header: "TIN" },
          { key: "withholding", header: "Withholding" },
        ]}
        rows={rows() ?? []}
        loading={rows.loading}
        selectedId={selected()}
        onSelect={setSelected}
        onEdit={(row) => setSelected(row.id)}
        onNew={() => {}}
        showNew={false}
        codeKey="employee_no"
        nameKey="employee_name"
      />
    </HrLayout>
  );
}
