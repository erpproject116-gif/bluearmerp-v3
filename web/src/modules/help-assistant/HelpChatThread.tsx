import { createSignal, For, Show } from "solid-js";
import { approveCopilotAction, denyCopilotAction } from "./helpApi";
import { HelpDeepLinkChips, HelpMarkdown } from "./HelpMarkdown";
import { HelpResultCard } from "./HelpResultCard";
import type { HelpChatMessage } from "./helpTypes";
import { safeAppPath } from "./safeAppPath";

/** Approve-to-seed handoffs: draft type → sessionStorage key the target screen consumes once. */
const SEED_STORAGE_KEYS: Record<string, string> = {
  create_quotation_from_rfq: "bluearm.rfqQuotationSeed",
  map_import_dataset: "bluearm.migImportSeed",
  open_quotation: "bluearm.docSeed.quotation",
  open_sales_order: "bluearm.docSeed.sales_order",
  open_sales: "bluearm.docSeed.sales",
  open_purchase_request: "bluearm.docSeed.purchase_request",
  open_rfq: "bluearm.docSeed.rfq",
  open_purchase_order: "bluearm.docSeed.purchase_order",
  open_purchases: "bluearm.docSeed.purchases",
  propose_serial_lot_import: "bluearm.serialLotSeed",
};

/** Soft-cap oversized seeds so we stay under typical sessionStorage quotas. */
function capSeedForStorage(seed: unknown): unknown {
  try {
    const raw = JSON.stringify(seed);
    if (raw.length <= 4_500_000) return seed;
    const s = seed as { lines?: Array<{ description?: string }> };
    if (Array.isArray(s?.lines)) {
      for (const line of s.lines) {
        if (line.description && line.description.length > 2_000) {
          line.description = line.description.slice(0, 2_000) + "\n…[truncated]";
        }
      }
    }
    return s;
  } catch {
    return seed;
  }
}

function AssistantBubble(props: {
  message: Extract<HelpChatMessage, { role: "assistant" }>;
  pathname: string;
  onAsk?: (text: string) => void;
}) {
  const [acting, setActing] = createSignal(false);
  const [actionNote, setActionNote] = createSignal("");
  const [detailsOpen, setDetailsOpen] = createSignal(false);
  const reply = () => props.message.reply;

  const deepLinks = () => reply().deepLinks ?? [];
  const primaryLink = () => (deepLinks().length === 1 ? deepLinks()[0] : null);
  const extraLinks = () => (deepLinks().length > 1 ? deepLinks() : []);
  const hasDetails = () =>
    !!reply().usedAi ||
    extraLinks().length > 0 ||
    (reply().hits?.length ?? 0) > 0;

  const onApprove = async () => {
    const draft = reply().actionDraft;
    if (!draft || acting()) return;
    setActing(true);
    try {
      const res = await approveCopilotAction(draft, reply().sessionId);
      if (!res.success) {
        setActionNote(res.message || "Approve failed.");
        return;
      }
      const result = res.data?.result as { next?: string; hint?: string; seed?: unknown } | undefined;
      const next = result?.next ? safeAppPath(result.next) : null;
      if (next) {
        const seedKey = SEED_STORAGE_KEYS[draft.type];
        if (result?.seed && seedKey) {
          try {
            sessionStorage.setItem(seedKey, JSON.stringify(capSeedForStorage(result.seed)));
          } catch {
            setActionNote("Approved, but the draft could not be staged in this browser.");
            return;
          }
        }
        setActionNote(result?.hint || "Opening…");
        window.setTimeout(() => {
          window.location.assign(next);
        }, 400);
        return;
      }
      setActionNote(result?.hint || "Approved.");
    } finally {
      setActing(false);
    }
  };

  const onDeny = async () => {
    const draft = reply().actionDraft;
    if (!draft || acting()) return;
    setActing(true);
    try {
      await denyCopilotAction(draft, reply().sessionId);
      setActionNote("Denied — nothing was posted.");
    } finally {
      setActing(false);
    }
  };

  return (
    <div class="flex justify-start">
      <div class="max-w-[min(42rem,95%)] space-y-2.5 rounded-2xl rounded-bl-md border border-stroke bg-white px-4 py-3 shadow-sm">
        <HelpMarkdown content={reply().message} hideExternalNote />
        <Show when={primaryLink()}>
          {(link) => <HelpDeepLinkChips links={[link()]} />}
        </Show>
        <Show when={reply().actionDraft}>
          <div class="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
            <p class="font-medium">Action draft — Approve to continue (nothing posted yet)</p>
            <p class="mt-1">{reply().actionDraft!.summary}</p>
            <Show when={!actionNote()}>
              <div class="mt-2 flex gap-2">
                <button
                  type="button"
                  class="rounded bg-brand-600 px-2 py-1 text-white disabled:opacity-50"
                  disabled={acting()}
                  onClick={() => void onApprove()}
                >
                  Approve
                </button>
                <button
                  type="button"
                  class="rounded border border-stroke bg-white px-2 py-1 disabled:opacity-50"
                  disabled={acting()}
                  onClick={() => void onDeny()}
                >
                  Deny
                </button>
              </div>
            </Show>
            <Show when={actionNote()}>
              <p class="mt-2 text-text-secondary">{actionNote()}</p>
            </Show>
          </div>
        </Show>
        <Show when={reply().fallback && reply().suggestions?.length}>
          <div class="flex flex-wrap gap-2">
            <For each={reply().suggestions}>
              {(title) => (
                <button
                  type="button"
                  class="rounded-full border border-stroke bg-slate-50 px-2.5 py-1 text-xs text-text-primary hover:bg-brand-50"
                  onClick={() => props.onAsk?.(title)}
                >
                  {title}
                </button>
              )}
            </For>
          </div>
        </Show>
        <Show when={hasDetails()}>
          <button
            type="button"
            class="text-[11px] font-medium text-brand-700 hover:underline"
            onClick={() => setDetailsOpen(!detailsOpen())}
          >
            {detailsOpen() ? "Hide details" : "Details"}
            <Show when={!detailsOpen() && (reply().hits?.length ?? 0) > 0}>
              <span class="ml-1 text-text-secondary">
                · {reply().hits!.length} guide{reply().hits!.length === 1 ? "" : "s"}
              </span>
            </Show>
            <Show when={!detailsOpen() && extraLinks().length > 0}>
              <span class="ml-1 text-text-secondary">· {extraLinks().length} links</span>
            </Show>
          </button>
        </Show>
        <Show when={detailsOpen()}>
          <div class="space-y-2 border-t border-stroke/60 pt-2">
            <Show when={reply().usedAi}>
              <p class="text-[11px] text-text-secondary">
                {reply().mode === "ops"
                  ? "Live data summary (permission-scoped)."
                  : "AI summary grounded in Bluearm guides and any files you attached."}
              </p>
            </Show>
            <Show when={extraLinks().length > 0}>
              <HelpDeepLinkChips links={extraLinks()} />
            </Show>
            <For each={reply().hits}>
              {(hit) => <HelpResultCard hit={hit} query={reply().query} pathname={props.pathname} />}
            </For>
            <p class="text-[10px] text-text-secondary">Links marked “opens outside Bluearm” leave this app.</p>
          </div>
        </Show>
      </div>
    </div>
  );
}

export function HelpChatThread(props: {
  messages: HelpChatMessage[];
  pathname: string;
  onAsk?: (text: string) => void;
  streamingText?: string;
  busy?: boolean;
}) {
  return (
    <div class="flex flex-col gap-4">
      <For each={props.messages}>
        {(msg) =>
          msg.role === "user" ? (
            <div class="flex justify-end">
              <div class="max-w-[min(36rem,85%)] space-y-2 rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white">
                <p class="whitespace-pre-wrap m-0">{msg.text}</p>
                <Show when={msg.attachments?.length}>
                  <div class="flex flex-wrap gap-1.5">
                    <For each={msg.attachments}>
                      {(a) => (
                        <span class="rounded bg-white/15 px-2 py-0.5 text-[11px]">{a.name}</span>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
          ) : (
            <AssistantBubble message={msg} pathname={props.pathname} onAsk={props.onAsk} />
          )
        }
      </For>
      <Show when={props.streamingText}>
        <div class="flex justify-start">
          <div class="max-w-[min(42rem,95%)] rounded-2xl rounded-bl-md border border-dashed border-stroke bg-slate-50 px-4 py-3">
            <HelpMarkdown content={props.streamingText || ""} class="text-text-secondary" hideExternalNote />
          </div>
        </div>
      </Show>
      <Show when={props.busy && !props.streamingText}>
        <div class="flex justify-start" aria-live="polite" aria-busy="true">
          <div class="inline-flex max-w-[min(42rem,95%)] items-center gap-2.5 rounded-2xl rounded-bl-md border border-stroke bg-white px-4 py-3 text-sm text-text-secondary shadow-sm">
            <span
              class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-brand-600 border-t-transparent"
              aria-hidden="true"
            />
            <span>Copilot is thinking…</span>
          </div>
        </div>
      </Show>
    </div>
  );
}
