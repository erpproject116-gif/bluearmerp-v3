import { createSignal, Show } from "solid-js";
import { useToast } from "../../../shared/toast";
import {
  patchPriceBatchLines,
  useInvalidatePriceBatchLines,
  usePriceBatchLines,
} from "../../../shared/usePriceBatchLines";
import { SalesLayout } from "../SalesLayout";
import { ChangeSalesPriceBatchFilter } from "./ChangeSalesPriceBatchFilter";
import { ChangeSalesPriceBatchGrid, type EditablePriceBatchRow } from "./ChangeSalesPriceBatchGrid";
import { defaultStatusFilters, type PriceBatchFilters } from "./salesStatusFilters";

export default function ChangeSalesPriceBatchPage() {
  const toast = useToast();
  const invalidate = useInvalidatePriceBatchLines();

  const [draftFilters, setDraftFilters] = createSignal<PriceBatchFilters>(defaultStatusFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<PriceBatchFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [editableRows, setEditableRows] = createSignal<EditablePriceBatchRow[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [pageSize, setPageSize] = createSignal(50);

  const query = usePriceBatchLines(() => ({
    filters: submittedFilters() ?? defaultStatusFilters(),
    page: page(),
    pageSize: pageSize(),
    sort: "order_date",
    order: "desc",
    enabled: submittedFilters() !== null,
  }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    setEditableRows([]);
  };

  const reset = () => {
    setDraftFilters(defaultStatusFilters());
    setSubmittedFilters(null);
    setPage(1);
    setEditableRows([]);
  };

  const save = async () => {
    const dirty = editableRows().filter((r) => r.dirty);
    if (dirty.length === 0) {
      toast.warning("No price changes to save.");
      return;
    }
    const lines = dirty.map((r) => ({
      line_id: r.line_id,
      unit_non_vat: Number(r.edit_unit_non_vat),
    }));
    setSaving(true);
    const res = await patchPriceBatchLines(lines);
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update prices.");
      return;
    }
    toast.success(`Updated ${res.data?.updated_count ?? lines.length} line(s).`);
    setEditableRows([]);
    invalidate();
  };

  return (
    <SalesLayout>
      <ChangeSalesPriceBatchFilter value={draftFilters} onChange={setDraftFilters} onSearch={search} onReset={reset} />

      <Show when={submittedFilters()}>
        <ChangeSalesPriceBatchGrid
          rows={query.data?.rows ?? []}
          loading={query.isFetching}
          page={page()}
          pageSize={pageSize()} onPageSizeChange={setPageSize}
          totalRows={query.data?.total ?? 0}
          onPageChange={setPage}
          editableRows={editableRows}
          onRowsChange={setEditableRows}
        />

        <div class="mt-4 flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={saving() || editableRows().filter((r) => r.dirty).length === 0}
            onClick={() => void save()}
          >
            {saving() ? "Saving…" : "Save price changes"}
          </button>
        </div>
      </Show>
    </SalesLayout>
  );
}
