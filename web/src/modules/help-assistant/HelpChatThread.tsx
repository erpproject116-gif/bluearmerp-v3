import { For, Show } from "solid-js";
import { HelpResultCard } from "./HelpResultCard";
import type { HelpChatMessage } from "./helpTypes";

function AssistantBubble(props: {
  message: Extract<HelpChatMessage, { role: "assistant" }>;
  pathname: string;
  onAsk?: (text: string) => void;
}) {
  return (
    <div class="flex justify-start">
      <div class="max-w-[95%] space-y-2 rounded-2xl rounded-bl-md border border-stroke bg-white px-3 py-2 shadow-sm">
        <p class="text-sm text-text-primary">{props.message.reply.message}</p>
        <Show when={props.message.reply.usedAi}>
          <p class="text-[11px] text-text-secondary">AI summary grounded in the articles below.</p>
        </Show>
        <Show when={props.message.reply.fallback && props.message.reply.suggestions?.length}>
          <div class="flex flex-wrap gap-2">
            <For each={props.message.reply.suggestions}>
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
        <For each={props.message.reply.hits}>
          {(hit) => (
            <HelpResultCard hit={hit} query={props.message.reply.query} pathname={props.pathname} />
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
    </div>
  );
}
