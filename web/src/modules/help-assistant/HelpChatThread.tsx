import { createSignal, For, Show } from "solid-js";
import { approveCopilotAction, denyCopilotAction } from "./helpApi";
import { HelpDeepLinkChips, HelpMarkdown } from "./HelpMarkdown";
import { HelpResultCard } from "./HelpResultCard";
import type { HelpChatMessage } from "./helpTypes";

function AssistantBubble(props: {
  message: Extract<HelpChatMessage, { role: "assistant" }>;
  pathname: string;
  onAsk?: (text: string) => void;
}) {
  const [acting, setActing] = createSignal(false);
  const [actionNote, setActionNote] = createSignal("");
  const reply = () => props.message.reply;

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
      const result = res.data?.result as { next?: string; hint?: string } | undefined;
      if (result?.next) {
        setActionNote(result.hint || "Opening…");
        window.setTimeout(() => {
          window.location.assign(result.next!);
        }, 400);
        return;
      }
      setActionNote("Approved — changes applied where allowed.");
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
      <div class="max-w-[min(42rem,95%)] space-y-3 rounded-2xl rounded-bl-md border border-stroke bg-white px-4 py-3 shadow-sm">
        <HelpMarkdown content={reply().message} />
        <Show when={reply().usedAi}>
          <p class="text-[11px] text-text-secondary">
            {reply().mode === "ops"
              ? "Live data summary (permission-scoped)."
              : "AI summary grounded in Bluearm guides and any files you attached."}
          </p>
        </Show>
        <Show when={reply().deepLinks?.length}>
          <HelpDeepLinkChips links={reply().deepLinks!} />
        </Show>
        <Show when={reply().actionDraft}>
          <div class="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
            <p class="font-medium">Action draft (not posted yet)</p>
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
        <For each={reply().hits}>
          {(hit) => (
            <HelpResultCard hit={hit} query={reply().query} pathname={props.pathname} />
          )}
        </For>
      </div>
    </div>
  );
}

export function HelpChatThread(props: {
  messages: HelpChatMessage[];
  pathname: string;
  onAsk?: (text: string) => void;
  streamingText?: string;
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
                        <span class="rounded bg-white/15 px-2 py-0.5 text-[11px]">
                          {a.name}
                        </span>
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
            <HelpMarkdown content={props.streamingText || ""} class="text-text-secondary" />
          </div>
        </div>
      </Show>
    </div>
  );
}
