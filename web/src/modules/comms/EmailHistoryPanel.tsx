import { For, Show, createSignal } from "solid-js";
import { createResource } from "solid-js";
import { apiFetch } from "../../shared/api";
import { hasPermission, useAuth } from "../../shared/auth-context";

export type DocEmailEntry = {
  source: "sent" | "mail";
  id: number;
  direction: string;
  subject: string;
  from_addr?: string;
  to_addrs: string[];
  status?: string;
  sent_by_name?: string;
  body_text?: string;
  snippet?: string;
  created_at: string;
};

type Props = {
  docType: string;
  docId: number | null | undefined;
  title?: string;
  defaultOpen?: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatAddrs(addrs?: string[]): string {
  return (addrs ?? []).join(", ");
}

/**
 * Inline email history for a document (sent log + synced Gmail thread messages).
 */
export function EmailHistoryPanel(props: Props) {
  const auth = useAuth();
  const [open, setOpen] = createSignal(Boolean(props.defaultOpen));
  const enabled = () => hasPermission(auth.me, "comms.read", "read") && !!props.docId && props.docId > 0;

  const [emails] = createResource(
    () => ({ open: open(), docId: props.docId, docType: props.docType, enabled: enabled() }),
    async ({ open: isOpen, docId, docType, enabled: canLoad }) => {
      if (!canLoad || !isOpen || !docId) return [];
      const qs = new URLSearchParams({ doc_type: docType, doc_id: String(docId) });
      const res = await apiFetch<DocEmailEntry[]>(`/api/v1/comms/doc-emails?${qs}`);
      if (!res.success) throw new Error(res.message ?? "Failed to load email history.");
      return res.data ?? [];
    },
  );

  return (
    <Show when={enabled()}>
      <div class="mt-4 rounded-lg border border-stroke">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-text-primary"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{props.title ?? "Email history"}</span>
          <svg
            class="h-4 w-4 transition-transform"
            classList={{ "rotate-180": open() }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <Show when={open()}>
          <div class="border-t border-stroke px-3 py-2">
            <Show when={emails.loading}>
              <p class="py-2 text-sm text-text-secondary">Loading…</p>
            </Show>
            <Show when={!emails.loading && emails.error}>
              <p class="py-2 text-sm text-red-600">{(emails.error as Error).message}</p>
            </Show>
            <Show when={!emails.loading && !emails.error}>
              <Show
                when={(emails()?.length ?? 0) > 0}
                fallback={<p class="py-2 text-sm text-text-secondary">No emails linked to this document yet.</p>}
              >
                <ul class="space-y-3">
                  <For each={emails() ?? []}>
                    {(row) => (
                      <li class="border-b border-stroke pb-3 last:border-0 last:pb-0">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm font-medium text-text-primary">{row.subject || "(no subject)"}</span>
                          <span class="text-xs text-text-secondary">{formatWhen(row.created_at)}</span>
                        </div>
                        <p class="mt-1 text-xs text-text-secondary">
                          {row.direction === "outbound" ? "To" : "From"}:{" "}
                          {row.direction === "outbound" ? formatAddrs(row.to_addrs) : row.from_addr || "—"}
                          {row.sent_by_name ? ` · ${row.sent_by_name}` : ""}
                          {row.status ? ` · ${row.status}` : ""}
                          {row.source === "mail" ? " · synced" : " · sent"}
                        </p>
                        <Show when={row.snippet || row.body_text}>
                          <p class="mt-1 line-clamp-2 text-xs text-text-secondary">{row.snippet || row.body_text}</p>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
