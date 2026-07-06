import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { EntityModal, Field, SpreadsheetGrid, inputClass, toolbarControlClass } from "../../../shared/SpreadsheetGrid";
import { submitEntity } from "../../../shared/handleSaveResult";
import { useToast } from "../../../shared/toast";

type DocGenRule = {
  id: number;
  name: string;
  active: boolean;
  source_entity: string;
  target_entity: string;
  field_map: Record<string, unknown> | string;
  summarize_by: string[];
  require_confirmed_source: boolean;
  updated_at: string;
};

const ENTITY_PAIRS = [
  { source: "quotation", target: "sales_order", label: "Quotation → Sales Order" },
  { source: "sales_order", target: "sales", label: "Sales Order → Sales Invoice" },
  { source: "sales_order", target: "delivery_receipt", label: "Sales Order → Delivery Receipt" },
  { source: "sales_order", target: "release", label: "Sales Order → Release" },
  { source: "purchase_request", target: "purchase_order", label: "Purchase Request → PO" },
  { source: "goods_receipt", target: "supplier_invoice", label: "Goods Receipt → Supplier Invoice" },
];

function pairLabel(source: string, target: string): string {
  return ENTITY_PAIRS.find((p) => p.source === source && p.target === target)?.label ?? `${source} → ${target}`;
}

function formatFieldMap(value: DocGenRule["field_map"]): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value ?? {}, null, 2);
}

export default function MappingCenterPage() {
  const toast = useToast();
  const [loading, setLoading] = createSignal(true);
  const [rows, setRows] = createSignal<DocGenRule[]>([]);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [editing, setEditing] = createSignal<DocGenRule | null>(null);
  const [saving, setSaving] = createSignal(false);

  const [name, setName] = createSignal("");
  const [active, setActive] = createSignal(true);
  const [pairKey, setPairKey] = createSignal("quotation->sales_order");
  const [fieldMapJson, setFieldMapJson] = createSignal("{}");
  const [summarizeBy, setSummarizeBy] = createSignal("");
  const [requireConfirmed, setRequireConfirmed] = createSignal(true);

  const load = async () => {
    setLoading(true);
    const res = await apiFetch<DocGenRule[]>("/api/v1/doc-generation/rules");
    setLoading(false);
    if (res.success && res.data) {
      setRows(res.data);
    } else {
      toast.error(res.message ?? "Failed to load mapping rules.");
    }
  };

  createEffect(() => {
    void load();
  });

  const openNew = () => {
    setEditing(null);
    setName("");
    setActive(true);
    setPairKey("quotation->sales_order");
    setFieldMapJson("{}");
    setSummarizeBy("");
    setRequireConfirmed(true);
    setModalOpen(true);
  };

  const openEdit = (row: DocGenRule) => {
    setEditing(row);
    setName(row.name);
    setActive(row.active);
    setPairKey(`${row.source_entity}->${row.target_entity}`);
    setFieldMapJson(formatFieldMap(row.field_map));
    setSummarizeBy((row.summarize_by ?? []).join(", "));
    setRequireConfirmed(row.require_confirmed_source);
    setModalOpen(true);
  };

  const parsePair = () => {
    const [source, target] = pairKey().split("->");
    return { source_entity: source ?? "", target_entity: target ?? "" };
  };

  const save = async () => {
    const trimmedName = name().trim();
    if (!trimmedName) {
      toast.warning("Rule name is required.");
      return;
    }
    let fieldMap: Record<string, unknown>;
    try {
      fieldMap = JSON.parse(fieldMapJson() || "{}") as Record<string, unknown>;
    } catch {
      toast.warning("Field map must be valid JSON.");
      return;
    }
    const { source_entity, target_entity } = parsePair();
    if (!source_entity || !target_entity) {
      toast.warning("Source and target are required.");
      return;
    }
    const summarize = summarizeBy()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);
    const ed = editing();
    const body = {
      name: trimmedName,
      active: active(),
      source_entity,
      target_entity,
      field_map: fieldMap,
      summarize_by: summarize,
      require_confirmed_source: requireConfirmed(),
    };
    const ok = await submitEntity(
      () =>
        ed
          ? apiFetch(`/api/v1/doc-generation/rules/${ed.id}`, {
              method: "PATCH",
              body: JSON.stringify(body),
            }, { silent: true })
          : apiFetch("/api/v1/doc-generation/rules", {
              method: "POST",
              body: JSON.stringify(body),
            }, { silent: true }),
      toast,
      ed ? "Rule updated." : "Rule created.",
    );
    setSaving(false);
    if (!ok) return;
    setModalOpen(false);
    void load();
  };

  const remove = async (row: DocGenRule) => {
    if (!confirm(`Delete mapping rule "${row.name}"?`)) return;
    const res = await apiFetch(`/api/v1/doc-generation/rules/${row.id}`, { method: "DELETE" });
    if (!res.success) {
      toast.error(res.message ?? "Failed to delete rule.");
      return;
    }
    toast.success("Rule deleted.");
    void load();
  };

  return (
    <div class="mx-auto max-w-6xl space-y-4 p-6">
      <div>
        <h1 class="text-xl font-semibold text-slate-900">Mapping Center</h1>
        <p class="mt-1 text-sm text-slate-600">
          Configure document generation rules that map source slips to target documents in BluearmERP.
        </p>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "name", header: "Name", clickable: true },
          {
            key: "pair",
            header: "Source → Target",
            sortable: false,
            render: (r) => pairLabel(r.source_entity, r.target_entity),
          },
          {
            key: "active",
            header: "Active",
            sortable: false,
            render: (r) => (r.active ? "Yes" : "No"),
          },
          {
            key: "require_confirmed_source",
            header: "Require confirmed",
            sortable: false,
            render: (r) => (r.require_confirmed_source ? "Yes" : "No"),
          },
          {
            key: "summarize_by",
            header: "Summarize by",
            sortable: false,
            render: (r) => (r.summarize_by?.length ? r.summarize_by.join(", ") : "—"),
          },
          { key: "updated_at", header: "Updated", render: (r) => new Date(r.updated_at).toLocaleString() },
          {
            key: "delete",
            header: "",
            sortable: false,
            render: (r) => (
              <button
                type="button"
                class="text-sm text-red-600 hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  void remove(r);
                }}
              >
                Delete
              </button>
            ),
          },
        ]}
        rows={rows()}
        loading={loading()}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        codeKey="name"
        nameKey="name"
        onRefresh={() => void load()}
      />

      <EntityModal
        open={modalOpen()}
        title={editing() ? "Edit mapping rule" : "New mapping rule"}
        saving={saving()}
        singleColumn
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <Field label="Name">
          <input class={inputClass} value={name()} onInput={(e) => setName(e.currentTarget.value)} />
        </Field>
        <Show when={!editing()}>
          <Field label="Source → Target">
            <select class={toolbarControlClass} value={pairKey()} onChange={(e) => setPairKey(e.currentTarget.value)}>
              <For each={ENTITY_PAIRS}>
                {(p) => <option value={`${p.source}->${p.target}`}>{p.label}</option>}
              </For>
            </select>
          </Field>
        </Show>
        <Show when={editing()}>
          <Field label="Source → Target">
            <p class="text-sm text-slate-700">{pairLabel(editing()!.source_entity, editing()!.target_entity)}</p>
          </Field>
        </Show>
        <Field label="Field map (JSON)" span="full">
          <textarea
            class={`${inputClass} min-h-[120px] font-mono text-xs`}
            value={fieldMapJson()}
            onInput={(e) => setFieldMapJson(e.currentTarget.value)}
          />
        </Field>
        <Field label="Summarize by (comma-separated)" span="full">
          <input
            class={inputClass}
            placeholder="e.g. partner_id, item_id"
            value={summarizeBy()}
            onInput={(e) => setSummarizeBy(e.currentTarget.value)}
          />
        </Field>
        <label class="col-span-full flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={active()} onChange={() => setActive((v) => !v)} />
          <span class="text-sm">Active</span>
        </label>
        <label class="col-span-full flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={requireConfirmed()} onChange={() => setRequireConfirmed((v) => !v)} />
          <span class="text-sm">Require confirmed source</span>
        </label>
      </EntityModal>
    </div>
  );
}
