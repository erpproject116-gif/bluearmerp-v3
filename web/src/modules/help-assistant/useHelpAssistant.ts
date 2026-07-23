import { createSignal } from "solid-js";
import { composeHelpReply } from "./composeHelpReply";
import {
  askCopilot,
  composeHelpWithAI,
  composeHelpWithAIStream,
  fetchHelpAIConfig,
  shouldUseCopilotAsk,
} from "./helpApi";
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
  const [streamingText, setStreamingText] = createSignal("");

  const refreshAIConfig = () => {
    void fetchHelpAIConfig().then((cfg) => setAiEnabled(!!(cfg?.enabled || cfg?.copilot)));
  };

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy()) return;
    const pathname = getPathname();
    const userMsg: HelpChatMessage = { id: nextId(), role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    setStreamingText("");

    void (async () => {
      try {
        const cfg = await fetchHelpAIConfig();
        if (cfg?.copilot && shouldUseCopilotAsk(q)) {
          const copilot = await askCopilot({ query: q, pathname });
          if (copilot?.message) {
            const hits =
              copilot.hits?.map((h) => ({
                articleId: h.article_id,
                title: h.title,
                snippet: h.snippet ?? "",
                articleHref: h.href ?? "/app/documentation",
              })) ?? [];
            const reply: HelpReply = {
              query: q,
              hits,
              fallback: false,
              message: copilot.message,
              usedAi: copilot.used_ai,
              deepLinks: copilot.deep_links,
              actionDraft: copilot.action_draft ?? null,
              sessionId: copilot.session_id,
              mode: copilot.mode,
            };
            setAiEnabled(true);
            setMessages((prev) => [...prev, { id: nextId(), role: "assistant", reply }]);
            return;
          }
        }

        let reply: HelpReply = composeHelpReply(q, pathname);
        if (!reply.fallback && reply.hits.length > 0 && cfg?.enabled) {
          try {
            // Prefer non-stream JSON compose (reliable behind Render/gzip). Streaming is optional.
            const ai = await composeHelpWithAI({
              query: q,
              pathname,
              hits: reply.hits,
            });
            if (ai?.used_ai && ai.message.trim()) {
              reply = {
                ...reply,
                message: ai.message.trim(),
                usedAi: true,
                sessionId: ai.session_id,
              };
              setAiEnabled(true);
            } else {
              const streamed = await composeHelpWithAIStream({
                query: q,
                pathname,
                hits: reply.hits,
                onDelta: (delta) => setStreamingText((prev) => prev + delta),
              });
              if (streamed?.used_ai && streamed.message.trim()) {
                reply = {
                  ...reply,
                  message: streamed.message.trim(),
                  usedAi: true,
                  sessionId: streamed.session_id,
                };
                setAiEnabled(true);
              }
            }
          } catch {
            // Keep deterministic local reply.
          }
        }
        const assistantMsg: HelpChatMessage = { id: nextId(), role: "assistant", reply };
        setMessages((prev) => [...prev, assistantMsg]);
      } finally {
        setBusy(false);
        setStreamingText("");
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
    streamingText,
    refreshAIConfig,
    ask,
    clear,
  };
}
