import { createMemo, createSignal, Show } from "solid-js";
import { KanbanBoard } from "../../shared/KanbanBoard";
import { KanbanCard, type KanbanDetailRow } from "../../shared/KanbanCard";
import { SpreadsheetGrid } from "../../shared/SpreadsheetGrid";
import { loadViewMode, ViewModeToggle, type ViewMode } from "../../shared/ViewModeToggle";
import { patchQuotationProgress } from "../../shared/useQuotationList";
import {
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_ORDER,
  useInvalidateQuotationPipeline,
  useQuotationPipeline,
  type QuotationPipelineCard,
  type QuotationPipelineStage,
} from "../../shared/useQuotationPipeline";
import { useListState } from "../../shared/useListState";
import { useToast } from "../../shared/toast";
import { CrmLayout } from "./CrmLayout";

const STORAGE_KEY = "crm-quotation-pipeline-view";

const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function humanizeStatus(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function quoteCardDetails(card: QuotationPipelineCard): KanbanDetailRow[] {
  const rows: KanbanDetailRow[] = [];
  if (card.item_name_summary) rows.push({ label: "Items", value: card.item_name_summary });
  rows.push({ label: "Total", value: `₱ ${money(card.grand_total)}` });
  if (card.valid_until) rows.push({ label: "Valid until", value: card.valid_until });
  if (card.pic_name) rows.push({ label: "PIC", value: card.pic_name });
  rows.push({ label: "Progress", value: humanizeStatus(card.progress_status) });
  if (card.voucher_status) rows.push({ label: "SO status", value: humanizeStatus(card.voucher_status) });
  return rows;
}

/** Map pipeline column drops to quotation progress_status where applicable. */
function stageToProgress(stage: QuotationPipelineStage): string | null {
  switch (stage) {
    case "open":
      return "in_progress";
    case "won":
      return "completed";
    default:
      return null;
  }
}

export default function QuotationPipelinePage() {
  const [viewMode, setViewMode] = createSignal<ViewMode>(loadViewMode(STORAGE_KEY, "board"));
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const { page, setPage, q, setQ, sort, order, toggleSort, pageSize } = useListState("order_date");
  const toast = useToast();
  const invalidate = useInvalidateQuotationPipeline();
  const pipeline = useQuotationPipeline();

  const allCards = createMemo(() => {
    const stages = pipeline.data?.stages;
    return PIPELINE_STAGE_ORDER.flatMap((s) => stages?.[s] ?? []);
  });

  const filteredCards = createMemo(() => {
    const needle = q().trim().toLowerCase();
    if (!needle) return allCards();
    return allCards().filter(
      (c) =>
        c.customer_name.toLowerCase().includes(needle) ||
        c.date_no_display.toLowerCase().includes(needle) ||
        (c.item_name_summary ?? "").toLowerCase().includes(needle),
    );
  });

  const pagedRows = createMemo(() => {
    const start = (page() - 1) * pageSize;
    return filteredCards().slice(start, start + pageSize);
  });

  const boardColumns = createMemo(() =>
    PIPELINE_STAGE_ORDER.map((stage) => ({
      id: stage,
      label: PIPELINE_STAGE_LABELS[stage],
      items: filteredCards().filter((c) => c.pipeline_stage === stage),
    })),
  );

  const onDrop = async (card: QuotationPipelineCard, _from: string, toColumnId: string) => {
    const progress = stageToProgress(toColumnId as QuotationPipelineStage);
    if (!progress) {
      toast.warning("This column is computed from quotation data — update progress via Open or Won columns.");
      return;
    }
    const res = await patchQuotationProgress(card.id, progress);
    if (!res.success) {
      toast.warning(res.message ?? "Could not update quotation.");
      return;
    }
    invalidate();
  };

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <ViewModeToggle value={viewMode()} onChange={setViewMode} storageKey={STORAGE_KEY} />
        <input
          type="search"
          class="rounded-lg border border-stroke px-3 py-2 text-sm"
          placeholder="Search customer or quote no…"
          value={q()}
          onInput={(e) => {
            setQ(e.currentTarget.value);
            setPage(1);
          }}
        />
      </div>

      <Show when={viewMode() === "table"}>
        <SpreadsheetGrid
          columns={[
            { key: "date_no_display", header: "Quote no.", clickable: true },
            { key: "reference_no", header: "Reference" },
            { key: "customer_name", header: "Customer", clickable: true },
            { key: "item_name_summary", header: "Items", render: (r) => r.item_name_summary ?? "—" },
            { key: "pipeline_stage", header: "Stage", render: (r) => PIPELINE_STAGE_LABELS[r.pipeline_stage] },
            { key: "valid_until", header: "Valid until", render: (r) => r.valid_until ?? "—" },
            { key: "progress_status", header: "Progress", render: (r) => humanizeStatus(r.progress_status) },
            { key: "grand_total", header: "Total", render: (r) => money(r.grand_total) },
          ]}
          rows={pagedRows()}
          loading={pipeline.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          onEdit={() => {}}
          onNew={() => {}}
          codeKey="date_no_display"
          nameKey="customer_name"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={filteredCards().length}
          onPageChange={setPage}
        />
      </Show>

      <Show when={viewMode() === "board"}>
        <KanbanBoard
          columns={boardColumns()}
          getCardId={(c) => c.id}
          onDrop={(item, from, to) => void onDrop(item, from, to)}
          loading={pipeline.isFetching}
          renderCard={(c) => (
            <KanbanCard
              title={c.date_no_display || c.reference_no}
              subtitle={c.customer_name}
              badge={c.reference_no}
              details={quoteCardDetails(c)}
              meta={c.order_date ? `Quoted ${c.order_date}` : undefined}
              severity={
                c.pipeline_stage === "expired"
                  ? "warning"
                  : c.pipeline_stage === "won"
                    ? "info"
                    : "info"
              }
            />
          )}
        />
      </Show>
    </CrmLayout>
  );
}
