import { A, useSearchParams } from "@solidjs/router";
import { For } from "solid-js";

export type DocumentListView = { id: string; label: string };

export const QUOTATION_LIST_VIEWS: DocumentListView[] = [
  { id: "list", label: "List" },
  { id: "status", label: "Status" },
  { id: "outstanding", label: "Open quotes" },
];

export const SALES_ORDER_LIST_VIEWS: DocumentListView[] = [
  { id: "list", label: "List" },
  { id: "status", label: "Status" },
  { id: "outstanding", label: "Open orders" },
];

export const SALES_LIST_VIEWS: DocumentListView[] = [
  { id: "list", label: "List" },
  { id: "status", label: "Status" },
  { id: "history", label: "History" },
];

export const PURCHASE_ORDER_LIST_VIEWS: DocumentListView[] = [
  { id: "list", label: "List" },
  { id: "status", label: "Status" },
  { id: "outstanding", label: "Open POs" },
];

export const PURCHASE_RECEIVE_LIST_VIEWS: DocumentListView[] = [
  { id: "list", label: "List" },
  { id: "status", label: "Status" },
  { id: "history", label: "History" },
];

/** In-page List / Status / Outstanding switcher. First view is the default (no query). */
export function DocumentListViewBar(props: { basePath: string; views: DocumentListView[] }) {
  const [params] = useSearchParams();
  const current = () => {
    const v = typeof params.view === "string" ? params.view : "";
    if (props.views.some((x) => x.id === v)) return v;
    return props.views[0]?.id ?? "list";
  };
  const hrefFor = (id: string) => {
    const first = props.views[0]?.id;
    return id === first ? props.basePath : `${props.basePath}?view=${id}`;
  };

  return (
    <nav class="mb-4 flex flex-wrap gap-1 border-b border-stroke pb-2" aria-label="List views">
      <For each={props.views}>
        {(v) => (
          <A
            href={hrefFor(v.id)}
            class="rounded-lg px-3 py-1.5 text-sm font-medium"
            classList={{
              "bg-brand-50 text-brand-700": current() === v.id,
              "text-text-secondary hover:bg-slate-50 hover:text-text-primary": current() !== v.id,
            }}
          >
            {v.label}
          </A>
        )}
      </For>
    </nav>
  );
}
