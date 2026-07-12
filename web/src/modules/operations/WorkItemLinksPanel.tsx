import { createEffect, createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import {
  createWorkItemLink,
  deleteWorkItemLink,
  listWorkItemLinks,
  searchERPDocs,
  type DocSearchHit,
  type WorkItemLink,
} from "../../shared/useOperations";

const DOC_TYPES = [
  { value: "quo_quotation", label: "Quotation" },
  { value: "po_purchase_order", label: "Purchase order" },
  { value: "sa_sales", label: "Sales invoice" },
  { value: "fin_official_receipt", label: "Official receipt" },
  { value: "job_cost_project", label: "Job cost project" },
] as const;

type Props = {
  workItemId: number;
  canEdit: boolean;
  onChanged?: () => void;
};

export function WorkItemLinksPanel(props: Props) {
  const toast = useToast();
  const [links, setLinks] = createSignal<WorkItemLink[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [docType, setDocType] = createSignal<string>("quo_quotation");
  const [query, setQuery] = createSignal("");
  const [hits, setHits] = createSignal<DocSearchHit[]>([]);
  const [searching, setSearching] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const reload = async () => {
    setLoading(true);
    const res = await listWorkItemLinks(props.workItemId);
    setLoading(false);
    if (res.success && res.data) setLinks(res.data);
  };

  createEffect(() => {
    void props.workItemId;
    void reload();
  });

  const runSearch = async () => {
    setSearching(true);
    const res = await searchERPDocs(docType(), query());
    setSearching(false);
    if (!res.success) {
      toast.warning(res.message ?? "Search failed.");
      return;
    }
    setHits(res.data ?? []);
  };

  const linkDoc = async (hit: DocSearchHit) => {
    setBusy(true);
    const res = await createWorkItemLink(props.workItemId, {
      doc_type: hit.doc_type,
      doc_id: hit.doc_id,
      link_type: "related",
    });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not link document.");
      return;
    }
    setHits([]);
    setQuery("");
    await reload();
    props.onChanged?.();
    toast.success(`Linked ${hit.label}.`);
  };

  const unlink = async (link: WorkItemLink) => {
    if (!confirm(`Unlink ${link.label || link.doc_type}?`)) return;
    setBusy(true);
    const res = await deleteWorkItemLink(props.workItemId, link.id);
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not unlink.");
      return;
    }
    await reload();
    props.onChanged?.();
    toast.success("Unlinked.");
  };

  const typeLabel = (docType: string) =>
    DOC_TYPES.find((d) => d.value === docType)?.label ?? docType;

  return (
    <div class="col-span-full mt-2 border-t border-stroke pt-4">
      <h3 class="mb-2 text-sm font-semibold text-text-primary">Linked documents</h3>
      <Show when={loading()}>
        <p class="text-xs text-text-secondary">Loading links…</p>
      </Show>
      <Show when={!loading() && links().length === 0}>
        <p class="mb-2 text-xs text-text-secondary">No ERP documents linked yet.</p>
      </Show>
      <ul class="mb-3 space-y-1">
        <For each={links()}>
          {(link) => (
            <li class="flex items-center justify-between gap-2 text-sm">
              <span class="min-w-0 truncate">
                <span class="text-text-secondary">{typeLabel(link.doc_type)} · </span>
                <Show when={link.href} fallback={<span>{link.label}</span>}>
                  <A href={link.href!} class="text-brand-600 hover:underline">
                    {link.label}
                  </A>
                </Show>
              </span>
              <Show when={props.canEdit}>
                <button
                  type="button"
                  class="shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void unlink(link)}
                >
                  Unlink
                </button>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={props.canEdit}>
        <div class="grid gap-2 sm:grid-cols-2">
          <Field label="Document type">
            <select class={inputClass} value={docType()} onChange={(e) => setDocType(e.currentTarget.value)}>
              <For each={[...DOC_TYPES]}>
                {(d) => <option value={d.value}>{d.label}</option>}
              </For>
            </select>
          </Field>
          <Field label="Search">
            <div class="flex gap-2">
              <input
                class={inputClass}
                value={query()}
                placeholder="Reference / number…"
                onInput={(e) => setQuery(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch();
                  }
                }}
              />
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 text-sm hover:bg-slate-50 disabled:opacity-50"
                disabled={searching()}
                onClick={() => void runSearch()}
              >
                Find
              </button>
            </div>
          </Field>
        </div>
        <Show when={hits().length > 0}>
          <ul class="mt-2 max-h-36 overflow-auto rounded-lg border border-stroke bg-slate-50 p-2 text-sm">
            <For each={hits()}>
              {(hit) => (
                <li class="flex items-center justify-between gap-2 py-1">
                  <span class="truncate">{hit.label}</span>
                  <button
                    type="button"
                    class="shrink-0 text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                    disabled={busy()}
                    onClick={() => void linkDoc(hit)}
                  >
                    Link
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </Show>
    </div>
  );
}
