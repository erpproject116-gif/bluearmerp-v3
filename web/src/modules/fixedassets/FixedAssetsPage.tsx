import { createSignal, For, Show } from "solid-js";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import {
  createAsset,
  createDepreciationRun,
  patchAsset,
  useDepreciationRuns,
  useFixedAssets,
  useInvalidateFixedAssets,
  type FixedAsset,
  type FixedAssetStatus,
} from "../../shared/useFixedAssets";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { useDocumentDraft } from "../../shared/useDocumentDraft";
import { DRAFT_ENTITY } from "../../shared/entityTypes";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { formatAmount, formatPeso } from "../../shared/money";

const STATUS_OPTIONS: FixedAssetStatus[] = ["active", "fully_depreciated", "disposed"];

export default function FixedAssetsPage() {
  const auth = useAuth();
  const canCreate = () => hasPermission(auth.me, "fixed_assets.assets_new", "write");
  const canRunDep = () => hasPermission(auth.me, "fixed_assets.depreciation_runs", "write");
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize, setPageSize } =
    useListState("acquisition_date", 25, { defaultStatus: "", defaultOrder: "desc" });
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [selected, setSelected] = createSignal<FixedAsset | null>(null);
  const [assetCode, setAssetCode] = createSignal("");
  const [assetName, setAssetName] = createSignal("");
  const [acquisitionDate, setAcquisitionDate] = createSignal(new Date().toISOString().slice(0, 10));
  const [acquisitionCost, setAcquisitionCost] = createSignal("");
  const [salvageValue, setSalvageValue] = createSignal("0");
  const [usefulLifeMonths, setUsefulLifeMonths] = createSignal("60");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [runningDep, setRunningDep] = createSignal(false);
  const [depYear, setDepYear] = createSignal(String(new Date().getFullYear()));
  const [depMonth, setDepMonth] = createSignal(String(new Date().getMonth() + 1));
  const toast = useToast();
  const invalidate = useInvalidateFixedAssets();

  const list = useFixedAssets(() => ({
    page: page(),
    pageSize: pageSize(),
    q: q() || undefined,
    status: statusFilter() || undefined,
    sort: sort(),
    order: order(),
  }));
  const runs = useDepreciationRuns(() => ({ page: 1, pageSize: 5 }));

  const openNew = () => {
    setSelected(null);
    setAssetCode("");
    setAssetName("");
    setAcquisitionDate(new Date().toISOString().slice(0, 10));
    setAcquisitionCost("");
    setSalvageValue("0");
    setUsefulLifeMonths("60");
    setNotes("");
    setModalOpen(true);
  };

  const openEdit = (row: FixedAsset) => {
    setSelected(row);
    setAssetCode(row.asset_code);
    setAssetName(row.asset_name);
    setAcquisitionDate(row.acquisition_date);
    setAcquisitionCost(String(row.acquisition_cost));
    setSalvageValue(String(row.salvage_value));
    setUsefulLifeMonths(String(row.useful_life_months));
    setNotes(row.notes ?? "");
    setModalOpen(true);
  };

  const draft = useDocumentDraft({
    entityType: DRAFT_ENTITY.fixedAsset,
    draftKey: () => (selected() ? `edit-${selected()!.id}` : "new"),
    getPayload: () => ({
      asset_code: assetCode(),
      asset_name: assetName(),
      acquisition_date: acquisitionDate(),
      acquisition_cost: acquisitionCost(),
      salvage_value: salvageValue(),
      useful_life_months: usefulLifeMonths(),
      notes: notes(),
    }),
    onApply: (payload) => {
      setAssetCode(payload.asset_code);
      setAssetName(payload.asset_name);
      setAcquisitionDate(payload.acquisition_date);
      setAcquisitionCost(payload.acquisition_cost);
      setSalvageValue(payload.salvage_value);
      setUsefulLifeMonths(payload.useful_life_months);
      setNotes(payload.notes);
    },
    enabled: () => modalOpen(),
    autoApply: () => modalOpen() && !selected(),
  });

  const save = async () => {
    if (!assetCode().trim() || !assetName().trim()) {
      toast.warning("Asset code and name are required.");
      return;
    }
    const cost = Number(acquisitionCost());
    if (!Number.isFinite(cost) || cost <= 0) {
      toast.warning("Acquisition cost must be greater than zero.");
      return;
    }
    setSaving(true);
    const body = {
      asset_code: assetCode().trim(),
      asset_name: assetName().trim(),
      acquisition_date: acquisitionDate(),
      acquisition_cost: cost,
      salvage_value: Number(salvageValue()) || 0,
      useful_life_months: Number(usefulLifeMonths()) || 60,
      notes: notes().trim() || undefined,
    };
    const row = selected();
    const res = row ? await patchAsset(row.id, body) : await createAsset(body);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not save asset.");
      return;
    }
    await draft.clearOnSave();
    setModalOpen(false);
    invalidate();
    toast.success(row ? "Asset updated." : "Asset created.");
  };

  const runDepreciation = async () => {
    setRunningDep(true);
    const res = await createDepreciationRun({
      period_year: Number(depYear()),
      period_month: Number(depMonth()),
    });
    setRunningDep(false);
    if (!res.success) {
      toast.warning(res.message ?? "Depreciation run failed.");
      return;
    }
    invalidate();
    toast.success(`Depreciation posted: ${formatPeso(res.data?.total_amount ?? 0)}`);
  };

  return (
    <div>
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <label class="text-sm text-text-secondary">
          Status
          <select
            class="ml-2 rounded border border-stroke px-2 py-1 text-sm"
            value={statusFilter()}
            onChange={(e) => setStatusFilter(e.currentTarget.value)}
          >
            <option value="">All</option>
            <For each={STATUS_OPTIONS}>{(s) => <option value={s}>{s.replace("_", " ")}</option>}</For>
          </select>
        </label>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "asset_code", header: "Code", clickable: true },
          { key: "asset_name", header: "Name" },
          { key: "acquisition_date", header: "Acquired" },
          { key: "acquisition_cost", header: "Cost", render: (r) => formatAmount(r.acquisition_cost as number) },
          { key: "accumulated_depreciation", header: "Accum. Dep.", render: (r) => formatAmount(r.accumulated_depreciation as number) },
          { key: "monthly_depreciation", header: "Monthly", render: (r) => formatAmount((r.monthly_depreciation as number) ?? 0) },
          { key: "status", header: "Status" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={openEdit}
        onNew={openNew}
        showNew={canCreate()}
        codeKey="asset_code"
        nameKey="asset_name"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize()} onPageSizeChange={setPageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search assets…"
      />

      <Show when={canRunDep()}>
        <section class="mt-8 rounded border border-stroke bg-surface p-4">
          <h2 class="mb-3 text-lg font-semibold text-text-primary">Monthly depreciation run</h2>
          <p class="mb-3 text-sm text-text-secondary">
            Straight-line depreciation for all active assets. Posts a journal entry for the period.
          </p>
          <div class="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Year">
              <input class={inputClass} type="number" value={depYear()} onInput={(e) => setDepYear(e.currentTarget.value)} />
            </Field>
            <Field label="Month">
              <input class={inputClass} type="number" min={1} max={12} value={depMonth()} onInput={(e) => setDepMonth(e.currentTarget.value)} />
            </Field>
            <button
              type="button"
              class="rounded bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={runningDep()}
              onClick={() => void runDepreciation()}
            >
              {runningDep() ? "Posting…" : "Run depreciation"}
            </button>
          </div>
          <Show when={(runs.data?.rows.length ?? 0) > 0}>
            <table class="w-full text-sm">
              <thead>
                <tr class="border-b border-stroke text-left text-text-secondary">
                  <th class="py-1 pr-2">Period</th>
                  <th class="py-1 pr-2">Amount</th>
                  <th class="py-1 pr-2">Status</th>
                  <th class="py-1">JE</th>
                </tr>
              </thead>
              <tbody>
                <For each={runs.data?.rows ?? []}>
                  {(run) => (
                    <tr class="border-b border-stroke/50">
                      <td class="py-1 pr-2">{run.period_year}-{String(run.period_month).padStart(2, "0")}</td>
                      <td class="py-1 pr-2">{formatAmount(run.total_amount)}</td>
                      <td class="py-1 pr-2">{run.status}</td>
                      <td class="py-1">{run.journal_entry_id ?? "—"}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </section>
      </Show>

      <EntityModal
        open={modalOpen()}
        title={selected() ? "Edit asset" : "New fixed asset"}
        saving={saving()}
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
      >
        <draft.DraftBanner />
        <Field label="Asset code">
          <input class={inputClass} value={assetCode()} disabled={!!selected()} onInput={(e) => setAssetCode(e.currentTarget.value)} />
        </Field>
        <Field label="Asset name">
          <input class={inputClass} value={assetName()} onInput={(e) => setAssetName(e.currentTarget.value)} />
        </Field>
        <Field label="Acquisition date">
          <input class={inputClass} type="date" value={acquisitionDate()} onInput={(e) => setAcquisitionDate(e.currentTarget.value)} />
        </Field>
        <Field label="Acquisition cost">
          <input class={inputClass} type="number" step="0.01" value={acquisitionCost()} onInput={(e) => setAcquisitionCost(e.currentTarget.value)} />
        </Field>
        <Field label="Salvage value">
          <input class={inputClass} type="number" step="0.01" value={salvageValue()} onInput={(e) => setSalvageValue(e.currentTarget.value)} />
        </Field>
        <Field label="Useful life (months)">
          <input class={inputClass} type="number" value={usefulLifeMonths()} onInput={(e) => setUsefulLifeMonths(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </div>
  );
}
