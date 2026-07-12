import { createSignal } from "solid-js";
import { composeHelpReply } from "./composeHelpReply";
import { composeHelpWithAI, fetchHelpAIConfig } from "./helpApi";
import type { HelpChatMessage, HelpReply } from "./helpTypes";

let msgSeq = 0;
function nextId() {
  msgSeq += 1;
  return `help-msg-${msgSeq}`;
}

export function useHelpAssistant(getPathname: () => string) {
  const [open, setOpen] = createSignal(false);
  const [messages, setMessages] = createSignal<HelpChatMessage[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [aiEnabled, setAiEnabled] = createSignal(false);

  const refreshAIConfig = () => {
    void fetchHelpAIConfig().then((cfg) => setAiEnabled(!!cfg?.enabled));
  };

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy()) return;
    const pathname = getPathname();
    const userMsg: HelpChatMessage = { id: nextId(), role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    void (async () => {
      try {
        let reply: HelpReply = composeHelpReply(q, pathname);
        if (!reply.fallback && reply.hits.length > 0) {
          try {
            const ai = await composeHelpWithAI({
              query: q,
              pathname,
              hits: reply.hits,
            });
            if (ai?.used_ai && ai.message.trim()) {
              reply = { ...reply, message: ai.message.trim(), usedAi: true };
              setAiEnabled(true);
            }
          } catch {
            // Keep deterministic local reply.
          }
        }
        const assistantMsg: HelpChatMessage = { id: nextId(), role: "assistant", reply };
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setBusy(false);
      }
    })();
  };

  const clear = () => setMessages([]);

  return {
    open,
    setOpen,
    messages,
    busy,
    aiEnabled,
    refreshAIConfig,
    ask,
    clear,
  };
}
