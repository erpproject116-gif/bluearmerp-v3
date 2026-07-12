import { createSignal, onMount, Show } from "solid-js";
import { DateInput } from "../../../shared/DateInput";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import {
  useInvalidateSerialLotLists,
  useSerialEventList,
  type SerialEventRow,
} from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";

type MovementFilters = {
  q?: string;
  event_type?: string;
  date_from?: string;
  date_to?: string;
};

function defaultMovementFilters(): MovementFilters {
  return { q: "", event_type: "", date_from: "", date_to: "" };
}

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "received", label: "Received" },
  { value: "transferred", label: "Transferred" },
  { value: "sold", label: "Sold" },
  { value: "reserved", label: "Reserved" },
  { value: "void", label: "Void" },
];

function eventTypeLabel(t: string): string {
  return EVENT_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export default function SerialMovementsListPage() {
  const invalidate = useInvalidateSerialLotLists();

  const [draftFilters, setDraftFilters] = createSignal<MovementFilters>(defaultMovementFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<MovementFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("created_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const list = useSerialEventList(() => {
    const f = submittedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      q: f?.q || undefined,
      event_type: f?.event_type || undefined,
      date_from: f?.date_from || undefined,
      date_to: f?.date_to || undefined,
      enabled: f != null,
    };
  });

  const patch = (p: Partial<MovementFilters>) => setDraftFilters((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    invalidate();
  };

  const reset = () => {
    setDraftFilters(defaultMovementFilters());
    setSubmittedFilters(null);
    setPage(1);
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <SerialLotLayout>
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <div class="mb-4">
          <p class="text-sm text-text-secondary">Set filters, then Search (F8).</p>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <Field label="Keyword">
            <input
              class={inputClass}
              value={draftFilters().q ?? ""}
              onInput={(e) => patch({ q: e.currentTarget.value })}
              placeholder="Serial no., item code…"
            />
          </Field>
          <Field label="Event type">
            <select
              class={inputClass}
              value={draftFilters().event_type ?? ""}
              onChange={(e) => patch({ event_type: e.currentTarget.value || undefined })}
            >
              {EVENT_TYPE_OPTIONS.map((o) => (
                <option value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date from">
            <DateInput value={draftFilters().date_from ?? ""} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
          </Field>
          <Field label="Date to">
            <DateInput value={draftFilters().date_to ?? ""} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-2 border-t border-stroke pt-4">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            onClick={search}
          >
            Search (F8)
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
            onClick={reset}
          >
            Reset
          </button>
        </div>
      </section>

      <Show when={submittedFilters()}>
        <div class="mt-6">
          <SpreadsheetGrid<SerialEventRow>
            columns={[
              { key: "created_at", header: "When", render: (r) => r.created_at.slice(0, 19).replace("T", " ") },
              { key: "event_type", header: "Event", render: (r) => eventTypeLabel(r.event_type) },
              { key: "serial_no", header: "Serial no.", clickable: true },
              { key: "item_code", header: "Item code" },
              { key: "item_name", header: "Item name" },
              { key: "from_location_name", header: "From", render: (r) => r.from_location_name ?? "—" },
              { key: "to_location_name", header: "To", render: (r) => r.to_location_name ?? "—" },
              { key: "created_by_name", header: "By", render: (r) => r.created_by_name || "—" },
              { key: "notes", header: "Notes", render: (r) => r.notes ?? "—" },
            ]}
            rows={list.data?.rows ?? []}
            loading={list.isFetching}
            selectedId={selectedId()}
            onSelect={setSelectedId}
            codeKey="serial_no"
            nameKey="event_type"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={list.data?.total ?? 0}
            onPageChange={setPage}
            onRefresh={invalidate}
            onNew={() => {}}
            onEdit={() => {}}
          />
        </div>
      </Show>
    </SerialLotLayout>
  );
}
