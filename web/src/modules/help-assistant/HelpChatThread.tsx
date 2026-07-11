import { For } from "solid-js";
import { HelpResultCard } from "./HelpResultCard";
import type { HelpChatMessage } from "./helpTypes";

function AssistantBubble(props: { message: Extract<HelpChatMessage, { role: "assistant" }> }) {
  return (
    <div class="flex justify-start">
      <div class="max-w-[95%] space-y-2 rounded-2xl rounded-bl-md border border-stroke bg-white px-3 py-2 shadow-sm">
        <p class="text-sm text-text-primary">{props.message.reply.message}</p>
        <For each={props.message.reply.hits}>{(hit) => <HelpResultCard hit={hit} />}</For>
      </div>
    </div>
  );
}

export function HelpChatThread(props: { messages: HelpChatMessage[] }) {
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
            <AssistantBubble message={msg} />
          )
        }
      </For>
    </div>
  );
}
