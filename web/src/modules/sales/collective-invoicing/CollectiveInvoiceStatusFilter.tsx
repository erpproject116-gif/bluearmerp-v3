import { createSignal, For } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { MultiSelectSearchModal, type MultiSelectRow } from "../../../shared/MultiSelectSearchModal";
import { LookupCombo } from "../../../shared/LookupCombo";
import {
  defaultCollectiveInvoiceStatusFilters,
  thisMonthRange,
  type CollectiveInvoiceStatusFilters,
  type SelectedItem,
} from "./collectiveInvoiceStatusFilters";
import {
  loadCollectiveInvoiceStatusTemplate,
  saveCollectiveInvoiceStatusTemplate,
  sortSubtotalLabel,
  type CollectiveInvoiceStatusTemplate,
  type InvoiceSortField,
} from "./collectiveInvoiceStatusTemplate";

type Props = {
  value: () => CollectiveInvoiceStatusFilters;
  onChange: (next: CollectiveInvoiceStatusFilters) => void;
  template: () => CollectiveInvoiceStatusTemplate;
  onTemplateChange: (next: CollectiveInvoiceStatusTemplate) => void;
  onSearch: () => void;
  onReset: () => void;
};

async function fetchDepartments(q: string) {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; name: string }[]>(`/api/v1/inventory/departments?${qs}`);
  return (res.data ?? []).map((d) => ({ id: d.id, label: d.name }));
}

async function fetchTaxTypes(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; name: string }[]>(`/api/v1/quotation/tax-types?${qs}`);
  return (res.data ?? []).map((t) => ({ id: t.id, code: String(t.id), name: t.name }));
}

async function fetchPartners(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(
    `/api/v1/inventory/partners?${qs}`,
  );
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, code: String(p.id), name: p.company_name }));
}

async function fetchProjects(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_code: string; project_name: string }[]>(
    `/api/v1/inventory/projects?${qs}`,
  );
  return (res.data ?? []).map((p) => ({ id: p.id, code: p.project_code, name: p.project_name }));
}

async function fetchUsers(q: string): Promise<MultiSelectRow[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ id: number; full_name: string }[]>(`/api/v1/inventory/after-sales/users${qs}`);
  return (res.data ?? []).map((u) => ({ id: u.id, code: String(u.id), name: u.full_name }));
}

function summaryLabels(items: SelectedItem[], max = 2): string {
  if (!items.length) return "";
  if (items.length <= max) return items.map((i) => i.label).join(", ");
  return `${items.slice(0, max).map((i) => i.label).join(", ")} +${items.length - max}`;
}

export function CollectiveInvoiceStatusFilter(props: Props) {
  const [taxTypes, setTaxTypes] = createSignal<SelectedItem[]>([]);
  const [partners, setPartners] = createSignal<SelectedItem[]>([]);
  const [projects, setProjects] = createSignal<SelectedItem[]>([]);
  const [pics, setPics] = createSignal<SelectedItem[]>([]);
  const [departmentLabel, setDepartmentLabel] = createSignal("");
  const [openTax, setOpenTax] = createSignal(false);
  const [openPartner, setOpenPartner] = createSignal(false);
  const [openProject, setOpenProject] = createSignal(false);
  const [openPic, setOpenPic] = createSignal(false);

  const patch = (p: Partial<CollectiveInvoiceStatusFilters>) => props.onChange({ ...props.value(), ...p });

  const patchTemplate = (p: Partial<CollectiveInvoiceStatusTemplate>) => {
    const next = { ...props.template(), ...p };
    saveCollectiveInvoiceStatusTemplate(next);
    props.onTemplateChange(next);
  };

  const toggleSort = (field: InvoiceSortField) => {
    const t = props.template();
    const sortOrder: "asc" | "desc" = t.sortField === field && t.sortOrder === "desc" ? "asc" : "desc";
    patchTemplate({
      sortField: field,
      sortOrder: t.sortField === field ? sortOrder : "desc",
    });
  };

  return (
    <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
      <h2 class="mb-4 text-lg font-semibold text-text-primary">Sales Invoice Status (Inv.)</h2>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Date from">
          <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
        </Field>
        <Field label="Date to">
          <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
        </Field>
        <Field label="Accounting Slip No.">
          <input
            class={inputClass}
            value={props.value().accounting_slip_no}
            onInput={(e) => patch({ accounting_slip_no: e.currentTarget.value })}
          />
        </Field>
        <Field label="Department">
          <LookupCombo
            label="Department"
            value={departmentLabel}
            selectedId={() => props.value().department_ids[0] ?? null}
            onInput={setDepartmentLabel}
            onSelect={(o) => {
              setDepartmentLabel(o.label);
              patch({ department_ids: [o.id] });
            }}
            onClear={() => {
              setDepartmentLabel("");
              patch({ department_ids: [] });
            }}
            fetchOptions={fetchDepartments}
          />
        </Field>
        <Field label="Tax Type">
          <button type="button" class={`${inputClass} text-left`} onClick={() => setOpenTax(true)}>
            {summaryLabels(taxTypes()) || "All tax types"}
          </button>
        </Field>
        <Field label="Customer">
          <button type="button" class={`${inputClass} text-left`} onClick={() => setOpenPartner(true)}>
            {summaryLabels(partners()) || "All customers"}
          </button>
        </Field>
        <Field label="Project">
          <button type="button" class={`${inputClass} text-left`} onClick={() => setOpenProject(true)}>
            {summaryLabels(projects()) || "All projects"}
          </button>
        </Field>
        <Field label="PIC">
          <button type="button" class={`${inputClass} text-left`} onClick={() => setOpenPic(true)}>
            {summaryLabels(pics()) || "All PICs"}
          </button>
        </Field>
        <Field label="Status">
          <select
            class={inputClass}
            value={props.value().status}
            onChange={(e) => patch({ status: e.currentTarget.value as CollectiveInvoiceStatusFilters["status"] })}
          >
            <option value="all">All</option>
            <option value="e_approval">E-Approval</option>
            <option value="unconfirmed">Unconfirmed</option>
            <option value="confirmed">Confirmed</option>
          </select>
        </Field>
        <Field label="Tax Entity">
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={props.value().tax_entity}
              onChange={(e) => patch({ tax_entity: e.currentTarget.checked })}
            />
            <span class="text-text-secondary">(filter deferred — no schema yet)</span>
          </label>
        </Field>
      </div>
      <p class="mt-3 text-sm text-text-secondary">Sort: {sortSubtotalLabel(props.template())}</p>
      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          onClick={props.onSearch}
        >
          Search
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          onClick={() => {
            const { from, to } = thisMonthRange();
            props.onReset();
            props.onChange({ ...defaultCollectiveInvoiceStatusFilters(), date_from: from, date_to: to });
            props.onTemplateChange(loadCollectiveInvoiceStatusTemplate());
          }}
        >
          Reset
        </button>
        <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => patchTemplate({ subtotalBy: "invoice_date" })}>
          Subtotal by month
        </button>
        <For each={["invoice_date", "customer_name", "grand_total", "receivable_no"] as InvoiceSortField[]}>
          {(field) => (
            <button type="button" class="rounded border border-stroke px-2 py-1 text-xs" onClick={() => toggleSort(field)}>
              Sort {field}
            </button>
          )}
        </For>
      </div>

      <MultiSelectSearchModal
        open={openTax()}
        title="Tax Types"
        selectedIds={() => props.value().tax_type_ids}
        onClose={() => setOpenTax(false)}
        onApply={(ids, rows) => {
          setTaxTypes(rows.map((r) => ({ id: r.id, label: r.name })));
          patch({ tax_type_ids: ids });
          setOpenTax(false);
        }}
        fetchRows={fetchTaxTypes}
      />
      <MultiSelectSearchModal
        open={openPartner()}
        title="Customers"
        selectedIds={() => props.value().partner_ids}
        onClose={() => setOpenPartner(false)}
        onApply={(ids, rows) => {
          setPartners(rows.map((r) => ({ id: r.id, label: r.name })));
          patch({ partner_ids: ids });
          setOpenPartner(false);
        }}
        fetchRows={fetchPartners}
      />
      <MultiSelectSearchModal
        open={openProject()}
        title="Projects"
        selectedIds={() => props.value().project_ids}
        onClose={() => setOpenProject(false)}
        onApply={(ids, rows) => {
          setProjects(rows.map((r) => ({ id: r.id, label: r.name })));
          patch({ project_ids: ids });
          setOpenProject(false);
        }}
        fetchRows={fetchProjects}
      />
      <MultiSelectSearchModal
        open={openPic()}
        title="PIC"
        selectedIds={() => props.value().pic_user_ids}
        onClose={() => setOpenPic(false)}
        onApply={(ids, rows) => {
          setPics(rows.map((r) => ({ id: r.id, label: r.name })));
          patch({ pic_user_ids: ids });
          setOpenPic(false);
        }}
        fetchRows={fetchUsers}
      />
    </section>
  );
}
