import { A } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { approveCopilotAction, denyCopilotAction } from "./helpApi";
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
      setActionNote(res.success ? "Approved — changes applied where allowed." : res.message || "Approve failed.");
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
      <div class="max-w-[95%] space-y-2 rounded-2xl rounded-bl-md border border-stroke bg-white px-3 py-2 shadow-sm">
        <p class="text-sm text-text-primary whitespace-pre-wrap">{reply().message}</p>
        <Show when={reply().usedAi}>
          <p class="text-[11px] text-text-secondary">
            {reply().mode === "ops" ? "Live data summary (permission-scoped)." : "AI summary grounded in the articles below."}
          </p>
        </Show>
        <Show when={reply().deepLinks?.length}>
          <div class="flex flex-wrap gap-2">
            <For each={reply().deepLinks}>
              {(link) => (
                <A href={link.href} class="text-xs text-brand-600 hover:underline">
                  {link.label}
                </A>
              )}
            </For>
          </div>
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
    <div class="flex flex-col gap-3">
      <For each={props.messages}>
        {(msg) =>
          msg.role === "user" ? (
            <div class="flex justify-end">
              <div class="max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-sm text-white">
                {msg.text}
              </div>
            </div>
          ) : (
            <AssistantBubble message={msg} pathname={props.pathname} onAsk={props.onAsk} />
          )
        }
      </For>
      <Show when={props.streamingText}>
        <div class="flex justify-start">
          <div class="max-w-[95%] rounded-2xl rounded-bl-md border border-dashed border-stroke bg-slate-50 px-3 py-2 text-sm text-text-secondary whitespace-pre-wrap">
            {props.streamingText}
          </div>
        </div>
      </Show>
    </div>
  );
}
