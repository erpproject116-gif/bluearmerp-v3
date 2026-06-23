import { Show } from "solid-js";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import type { ActivityLogFilterState } from "./ActivityLogLayout";

export function ActivityLogFilterPanel(props: {
  draftFilters: () => ActivityLogFilterState;
  setDraftFilters: (fn: (f: ActivityLogFilterState) => ActivityLogFilterState) => void;
  onSearch: () => void;
  onReset: () => void;
  showReferenceNo?: boolean;
}) {
  return (
    <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Date from">
          <input
            type="date"
            class={inputClass}
            value={props.draftFilters().dateFrom}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, dateFrom: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Date to">
          <input
            type="date"
            class={inputClass}
            value={props.draftFilters().dateTo}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, dateTo: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Actor user ID">
          <input
            type="text"
            class={inputClass}
            placeholder="User id"
            value={props.draftFilters().actorUserId}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, actorUserId: e.currentTarget.value }))}
          />
        </Field>
        <Show when={props.showReferenceNo}>
          <Field label="Reference / serial / receipt no.">
            <input
              type="text"
              class={inputClass}
              placeholder="e.g. 260622201, DEMO-SN-001"
              value={props.draftFilters().referenceNo ?? ""}
              onInput={(e) => props.setDraftFilters((f) => ({ ...f, referenceNo: e.currentTarget.value }))}
            />
          </Field>
        </Show>
        <Field label="Action code">
          <input
            type="text"
            class={inputClass}
            placeholder="e.g. sales.update"
            value={props.draftFilters().actionCode}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, actionCode: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Target type">
          <input
            type="text"
            class={inputClass}
            placeholder="e.g. sa_sales"
            value={props.draftFilters().targetType}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, targetType: e.currentTarget.value }))}
          />
        </Field>
        <Field label="Module">
          <input
            type="text"
            class={inputClass}
            placeholder="Prefix e.g. sales"
            value={props.draftFilters().module}
            onInput={(e) => props.setDraftFilters((f) => ({ ...f, module: e.currentTarget.value }))}
          />
        </Field>
        <div class="flex gap-2 pb-0.5">
          <button
            type="button"
            class="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            onClick={props.onSearch}
          >
            Search
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50"
            onClick={props.onReset}
          >
            Reset
          </button>
        </div>
      </div>
    </section>
  );
}
