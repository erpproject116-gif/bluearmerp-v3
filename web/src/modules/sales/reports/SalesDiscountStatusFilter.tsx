import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { DateInput } from "../../../shared/DateInput";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { MultiSelectSearchModal, type MultiSelectRow } from "../../../shared/MultiSelectSearchModal";
import { Modal } from "../../../shared/Modal";
import {
  formatDisplayDate,
  LOCATION_TYPE_GROUPS,
  thisMonthRange,
  todayISO,
  type SalesDiscountStatusFilters,
  type SelectedItem,
} from "./salesDiscountStatusFilters";
import {
  applyReportPreset,
  detectPresetId,
  DISCOUNT_REPORT_PRESETS,
  type DiscountReportPresetId,
} from "./salesDiscountStatusReportPresets";
import { SalesDiscountStatusSortSubtotalModal } from "./SalesDiscountStatusSortSubtotalModal";
import { SalesDiscountStatusSaveTemplateModal } from "./SalesDiscountStatusSaveTemplateModal";
import { ReportColumnEditorModal } from "../../../shared/reportTemplates/ReportColumnEditorModal";
import { ReportLogoField } from "../../../shared/reportTemplates/ReportLogoField";
import { DISCOUNT_REPORT_KEY } from "./useDiscountReportTemplates";
import { DISCOUNT_STATUS_COLUMNS, type DiscountColumnKey } from "./discountStatusColumns";
import {
  applySavedSettings,
  deleteDiscountReportTemplate,
  type SavedDiscountReportSettings,
  useDiscountReportTemplates,
  useInvalidateDiscountReportTemplates,
} from "./useDiscountReportTemplates";
import { savePrintPageSettings } from "../../../shared/printPageSettings";
import { useToast } from "../../../shared/toast";
import {
  loadDiscountStatusTemplate,
  saveDiscountStatusTemplate,
  sortSubtotalLabel,
  type SalesDiscountStatusTemplate,
} from "./salesDiscountStatusTemplate";

type Props = {
  value: () => SalesDiscountStatusFilters;
  onChange: (next: SalesDiscountStatusFilters) => void;
  template: () => SalesDiscountStatusTemplate;
  onTemplateChange: (next: SalesDiscountStatusTemplate) => void;
  onSearch: () => void;
  onReset: () => void;
};

async function fetchTaxTypes(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; name: string }[]>(`/api/v1/quotation/tax-types?${qs}`);
  return (res.data ?? []).map((t) => ({ id: t.id, code: String(t.id), name: t.name }));
}

async function fetchLocations(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; location_code: string; location_name: string; location_type: string }[]>(
    `/api/v1/inventory/locations?${qs}`,
  );
  return (res.data ?? []).map((l) => ({ id: l.id, code: l.location_code, name: l.location_name, keyword: l.location_type }));
}

async function fetchPartners(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "50", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; company_name: string; partner_kind: string }[]>(`/api/v1/inventory/partners?${qs}`);
  return (res.data ?? [])
    .filter((p) => p.partner_kind === "customer" || p.partner_kind === "both")
    .map((p) => ({ id: p.id, code: String(p.id), name: p.company_name, keyword: p.partner_kind }));
}

async function fetchProjects(q: string): Promise<MultiSelectRow[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "100", status: "active" });
  if (q) qs.set("q", q);
  const res = await apiFetch<{ id: number; project_code: string; project_name: string }[]>(`/api/v1/inventory/projects?${qs}`);
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

export function SalesDiscountStatusFilter(props: Props) {
  const [taxTypes, setTaxTypes] = createSignal<SelectedItem[]>([]);
  const [locations, setLocations] = createSignal<SelectedItem[]>([]);
  const [locationTypes, setLocationTypes] = createSignal<SelectedItem[]>([]);
  const [partners, setPartners] = createSignal<SelectedItem[]>([]);
  const [projects, setProjects] = createSignal<SelectedItem[]>([]);
  const [pics, setPics] = createSignal<SelectedItem[]>([]);

  const [openTax, setOpenTax] = createSignal(false);
  const [openLocation, setOpenLocation] = createSignal(false);
  const [openLocationGroup, setOpenLocationGroup] = createSignal(false);
  const [openPartner, setOpenPartner] = createSignal(false);
  const [openProject, setOpenProject] = createSignal(false);
  const [openPic, setOpenPic] = createSignal(false);
  const [openSortSubtotal, setOpenSortSubtotal] = createSignal(false);
  const [openSaveTemplate, setOpenSaveTemplate] = createSignal(false);
  const [openColumns, setOpenColumns] = createSignal(false);
  const [groupPicked, setGroupPicked] = createSignal<Set<string>>(new Set());
  const toast = useToast();
  const customTemplates = useDiscountReportTemplates();
  const invalidateTemplates = useInvalidateDiscountReportTemplates();

  const patch = (p: Partial<SalesDiscountStatusFilters>) => props.onChange({ ...props.value(), ...p });

  const patchTemplate = (p: Partial<SalesDiscountStatusTemplate>) => {
    const next = { ...props.template(), ...p };
    if (!("customTemplateCode" in p) && !("customTemplateId" in p)) {
      next.customTemplateId = null;
      next.customTemplateCode = null;
    }
    next.appliedPresetId = detectPresetId(next);
    props.onTemplateChange(next);
    saveDiscountStatusTemplate(next);
  };

  const applyPreset = (presetId: DiscountReportPresetId) => {
    const next = applyReportPreset(props.template(), presetId);
    props.onTemplateChange(next);
    saveDiscountStatusTemplate(next);
  };

  const templateSelectValue = () => {
    if (props.template().customTemplateCode) return `custom:${props.template().customTemplateCode}`;
    return `preset:${props.template().appliedPresetId}`;
  };

  const onTemplateSelect = (value: string) => {
    if (value.startsWith("custom:")) {
      const code = value.slice(7);
      const row = (customTemplates.data ?? []).find((t) => t.template_code === code);
      if (!row) return;
      const settings = row.settings as SavedDiscountReportSettings;
      if (settings.printPageSettings) savePrintPageSettings(settings.printPageSettings);
      const next = applySavedSettings(props.template(), settings, row.id, row.template_code);
      next.appliedPresetId = detectPresetId(next);
      props.onTemplateChange(next);
      saveDiscountStatusTemplate(next);
      return;
    }
    const presetId = value.replace(/^preset:/, "") as DiscountReportPresetId;
    applyPreset(presetId);
  };

  const deleteCustomTemplate = async () => {
    const code = props.template().customTemplateCode;
    if (!code) return;
    if (!window.confirm(`Delete saved template "${code}"?`)) return;
    try {
      await deleteDiscountReportTemplate(code);
      invalidateTemplates();
      applyPreset("default");
      toast.success("Template deleted.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete template.");
    }
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        props.onSearch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  createEffect(() => {
    if (openLocationGroup()) {
      setGroupPicked(new Set(props.value().location_types));
    }
  });

  const applyIds = (
    ids: number[],
    rows: MultiSelectRow[],
    setter: (items: SelectedItem[]) => void,
    key: keyof Pick<SalesDiscountStatusFilters, "tax_type_ids" | "location_ids" | "project_ids" | "pic_user_ids" | "partner_ids">,
  ) => {
    setter(rows.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, label: r.name })));
    patch({ [key]: ids });
  };

  return (
    <>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Sales Discount Status</h2>
          <p class="text-sm text-text-secondary">Set filters, then Search (F8).</p>
        </div>

        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Date from">
            <DateInput value={props.value().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
          </Field>
          <Field label="Date to">
            <DateInput value={props.value().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
          </Field>
          <Field label="Transaction type">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenTax(true)}>
              {summaryLabels(taxTypes()) || "Transaction type…"}
            </button>
          </Field>
          <Field label="Location-Out">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenLocation(true)}>
              {summaryLabels(locations()) || "Location-Out…"}
            </button>
          </Field>
          <Field label="Location Level Group">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenLocationGroup(true)}>
              {summaryLabels(locationTypes()) || "Location Level Group…"}
            </button>
          </Field>
          <Field label="Customer/Vendor">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenPartner(true)}>
              {summaryLabels(partners()) || "Customer/Vendor…"}
            </button>
          </Field>
          <Field label="Project">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenProject(true)}>
              {summaryLabels(projects()) || "Project…"}
            </button>
          </Field>
          <Field label="PIC for Customer/Vendor">
            <button type="button" class={`${inputClass} w-full text-left`} onClick={() => setOpenPic(true)}>
              {summaryLabels(pics()) || "PIC…"}
            </button>
          </Field>
          <Field label="Discount amount from">
            <input
              type="number"
              class={inputClass}
              value={props.value().discount_from ?? ""}
              onInput={(e) => patch({ discount_from: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
            />
          </Field>
          <Field label="Discount amount to">
            <input
              type="number"
              class={inputClass}
              value={props.value().discount_to ?? ""}
              onInput={(e) => patch({ discount_to: e.currentTarget.value === "" ? null : Number(e.currentTarget.value) })}
            />
          </Field>
          <Field label="Remark" span="full">
            <textarea
              class={inputClass}
              rows={3}
              value={props.value().remark ?? ""}
              onInput={(e) => patch({ remark: e.currentTarget.value })}
            />
          </Field>
        </div>

        <div class="mt-4 rounded-lg border border-stroke bg-slate-50 p-4">
          <h3 class="mb-2 text-sm font-semibold text-text-primary">Template</h3>
          <div class="grid gap-2 text-sm md:grid-cols-2">
            <Field label="Applied Template">
              <select
                class={inputClass}
                value={templateSelectValue()}
                onChange={(e) => onTemplateSelect(e.currentTarget.value)}
              >
                <optgroup label="Built-in">
                  {DISCOUNT_REPORT_PRESETS.map((p) => (
                    <option value={`preset:${p.id}`}>{p.label}</option>
                  ))}
                </optgroup>
                <Show when={(customTemplates.data ?? []).length}>
                  <optgroup label="Saved">
                    {(customTemplates.data ?? []).map((t) => (
                      <option value={`custom:${t.template_code}`}>{t.template_name}</option>
                    ))}
                  </optgroup>
                </Show>
              </select>
            </Field>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => setOpenColumns(true)}>
                Columns…
              </button>
              <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => setOpenSaveTemplate(true)}>
                Save as…
              </button>
              <Show when={props.template().customTemplateCode}>
                <button type="button" class="text-sm text-red-600 hover:underline" onClick={() => void deleteCustomTemplate()}>
                  Delete saved
                </button>
              </Show>
            </div>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={props.template().displayApvlLine}
                onChange={(e) => patchTemplate({ displayApvlLine: e.currentTarget.checked })}
              />
              Display Apvl. Line
            </label>
            <div>
              <span class="text-text-secondary">Sort/Subtotal Criteria:</span>{" "}
              <button
                type="button"
                class="text-brand-600 hover:underline"
                onClick={() => setOpenSortSubtotal(true)}
              >
                {sortSubtotalLabel(props.template())}
              </button>
            </div>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                checked={props.template().viewAsGraph}
                onChange={(e) => patchTemplate({ viewAsGraph: e.currentTarget.checked, customTemplateId: null, customTemplateCode: null })}
              />
              View as Graph
            </label>
            <Field label="Print header (optional)">
              <input class={inputClass} value={props.template().printHeader} onInput={(e) => patchTemplate({ printHeader: e.currentTarget.value })} />
            </Field>
            <Field label="Print footer (optional)">
              <input class={inputClass} value={props.template().printFooter} onInput={(e) => patchTemplate({ printFooter: e.currentTarget.value })} />
            </Field>
            <ReportLogoField
              reportKey={DISCOUNT_REPORT_KEY}
              logoAssetId={props.template().logoAssetId}
              onChange={(logoAssetId) => patchTemplate({ logoAssetId })}
            />
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stroke pt-4">
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700" onClick={() => props.onSearch()}>
            Search (F8)
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={() => {
            setTaxTypes([]); setLocations([]); setLocationTypes([]); setPartners([]); setProjects([]); setPics([]);
            const tpl = loadDiscountStatusTemplate();
            props.onTemplateChange(tpl);
            props.onReset();
          }}>
            Reset
          </button>
          <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => patch({ date_from: todayISO(), date_to: todayISO() })}>Today</button>
          <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => { const { from, to } = thisMonthRange(); patch({ date_from: from, date_to: to }); }}>This Month (~ Today)</button>
          <Show when={props.value().date_from && props.value().date_to}>
            <span class="ml-auto text-xs text-text-secondary">{formatDisplayDate(props.value().date_from)} – {formatDisplayDate(props.value().date_to)}</span>
          </Show>
        </div>
      </section>

      <MultiSelectSearchModal open={openTax()} title="Transaction Type (Sales) View" selectedIds={() => props.value().tax_type_ids} fetchRows={fetchTaxTypes} onClose={() => setOpenTax(false)} onApply={(ids, rows) => { applyIds(ids, rows, setTaxTypes, "tax_type_ids"); setOpenTax(false); }} />
      <MultiSelectSearchModal open={openLocation()} title="Search Location" selectedIds={() => props.value().location_ids} fetchRows={fetchLocations} onClose={() => setOpenLocation(false)} onApply={(ids, rows) => { applyIds(ids, rows, setLocations, "location_ids"); setOpenLocation(false); }} showKeyword />
      <MultiSelectSearchModal open={openPartner()} title="Search Customer/Vendor" selectedIds={() => props.value().partner_ids} fetchRows={fetchPartners} onClose={() => setOpenPartner(false)} onApply={(ids, rows) => { applyIds(ids, rows, setPartners, "partner_ids"); setOpenPartner(false); }} showKeyword />
      <MultiSelectSearchModal open={openProject()} title="Project List" selectedIds={() => props.value().project_ids} fetchRows={fetchProjects} onClose={() => setOpenProject(false)} onApply={(ids, rows) => { applyIds(ids, rows, setProjects, "project_ids"); setOpenProject(false); }} />
      <MultiSelectSearchModal open={openPic()} title="Search Employee" selectedIds={() => props.value().pic_user_ids} fetchRows={fetchUsers} onClose={() => setOpenPic(false)} onApply={(ids, rows) => { applyIds(ids, rows, setPics, "pic_user_ids"); setOpenPic(false); }} showKeyword={false} />

      <Modal open={openLocationGroup()} title="Location Level Group" onClose={() => setOpenLocationGroup(false)}>
        <div class="max-h-64 space-y-2 overflow-y-auto">
          <For each={LOCATION_TYPE_GROUPS}>
            {(g) => (
              <label class="flex cursor-pointer items-center gap-2 rounded border border-stroke px-3 py-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={groupPicked().has(g.value)}
                  onChange={() => {
                    setGroupPicked((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.value)) next.delete(g.value);
                      else next.add(g.value);
                      return next;
                    });
                  }}
                />
                [{g.label}] {g.label}
              </label>
            )}
          </For>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white"
            onClick={() => {
              const types = [...groupPicked()];
              setLocationTypes(LOCATION_TYPE_GROUPS.filter((g) => types.includes(g.value)).map((g) => ({ id: 0, label: g.label })));
              patch({ location_types: types });
              setOpenLocationGroup(false);
            }}
          >
            Apply
          </button>
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => setOpenLocationGroup(false)}>Close</button>
        </div>
      </Modal>

      <ReportColumnEditorModal<DiscountColumnKey>
        open={openColumns()}
        columns={DISCOUNT_STATUS_COLUMNS}
        value={props.template().columnVisibility}
        onClose={() => setOpenColumns(false)}
        onApply={(next) => {
          patchTemplate({ columnVisibility: next });
          setOpenColumns(false);
        }}
      />

      <SalesDiscountStatusSaveTemplateModal
        open={openSaveTemplate()}
        template={props.template}
        onClose={() => setOpenSaveTemplate(false)}
        onSaved={async (code) => {
          await invalidateTemplates();
          await customTemplates.refetch();
          onTemplateSelect(`custom:${code}`);
        }}
      />

      <SalesDiscountStatusSortSubtotalModal
        open={openSortSubtotal()}
        value={props.template()}
        onClose={() => setOpenSortSubtotal(false)}
        onApply={(next) => {
          next.appliedPresetId = detectPresetId(next);
          props.onTemplateChange(next);
          saveDiscountStatusTemplate(next);
          setOpenSortSubtotal(false);
        }}
      />
    </>
  );
}
