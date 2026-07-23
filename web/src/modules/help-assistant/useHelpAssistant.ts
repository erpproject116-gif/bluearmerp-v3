import { createSignal } from "solid-js";
import { composeHelpReply } from "./composeHelpReply";
import type { ExtractedAttachment } from "./extractAttachment";
import {
  askCopilot,
  composeHelpWithAI,
  deleteCopilotSession,
  fetchHelpAIConfig,
  getCopilotSession,
  listCopilotSessions,
  parseEntityMentions,
  type CopilotSessionSummary,
  type HelpAttachmentPayload,
} from "./helpApi";
import type { HelpChatMessage, HelpReply } from "./helpTypes";

let msgSeq = 0;
function nextId() {
  msgSeq += 1;
  return `help-msg-${msgSeq}`;
}

function toPayload(atts: ExtractedAttachment[]): HelpAttachmentPayload[] {
  return atts.map((a) => ({ name: a.name, kind: a.kind, text: a.text }));
}

export function useHelpAssistant(getPathname: () => string) {
  const [messages, setMessages] = createSignal<HelpChatMessage[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [aiEnabled, setAiEnabled] = createSignal(false);
  const [streamingText, setStreamingText] = createSignal("");
  const [sessionId, setSessionId] = createSignal<number | undefined>(undefined);
  const [sessions, setSessions] = createSignal<CopilotSessionSummary[]>([]);
  const [sessionsOpen, setSessionsOpen] = createSignal(false);
  const [maximized, setMaximized] = createSignal(false);

  const refreshAIConfig = () => {
    void fetchHelpAIConfig().then((cfg) => setAiEnabled(!!(cfg?.enabled || cfg?.copilot)));
  };

  const refreshSessions = async () => {
    const res = await listCopilotSessions();
    if (res.success && res.data) setSessions(res.data);
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(undefined);
    setStreamingText("");
  };

  const loadSession = async (id: number) => {
    const res = await getCopilotSession(id);
    if (!res.success || !res.data) return;
    setSessionId(res.data.id);
    const mapped: HelpChatMessage[] = [];
    for (const m of res.data.messages) {
      if (m.role === "user") {
        mapped.push({ id: nextId(), role: "user", text: m.content });
      } else if (m.role === "assistant") {
        mapped.push({
          id: nextId(),
          role: "assistant",
          reply: {
            query: "",
            hits: [],
            fallback: false,
            message: m.content,
            usedAi: true,
            sessionId: res.data.id,
          },
        });
      }
    }
    setMessages(mapped);
    setSessionsOpen(false);
  };

  const removeSession = async (id: number) => {
    await deleteCopilotSession(id);
    if (sessionId() === id) newChat();
    await refreshSessions();
  };

  const ask = (text: string, attachments: ExtractedAttachment[] = []) => {
    const q = text.trim();
    if ((!q && !attachments.length) || busy()) return;
    const pathname = getPathname();
    const displayQ = q || (attachments.length ? `Review attached file(s): ${attachments.map((a) => a.name).join(", ")}` : "");
    const userMsg: HelpChatMessage = {
      id: nextId(),
      role: "user",
      text: displayQ,
      attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })),
    };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    setStreamingText("");

    void (async () => {
      try {
        const cfg = await fetchHelpAIConfig();
        const attPayload = toPayload(attachments);
        const sid = sessionId();

        // When Copilot is enabled, always use /copilot/ask — the API classifies
        // docs vs live ops vs approve-to-act. A narrow keyword gate was dropping
        // real finance questions (expenses, revenue, projections) into KB-only mode.
        if (cfg?.copilot) {
          const copilot = await askCopilot({
            query: displayQ,
            pathname,
            sessionId: sid,
            attachments: attPayload,
            entities: parseEntityMentions(displayQ),
          });
          if (copilot?.message) {
            if (copilot.session_id) setSessionId(copilot.session_id);
            const hits =
              copilot.hits?.map((h) => ({
                articleId: h.article_id,
                title: h.title,
                snippet: h.snippet ?? "",
                articleHref: h.href ?? "/app/documentation",
              })) ?? [];
            const reply: HelpReply = {
              query: displayQ,
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
            void refreshSessions();
            return;
          }
        }

        let reply: HelpReply = composeHelpReply(displayQ, pathname);
        if ((!reply.fallback && reply.hits.length > 0 && cfg?.enabled) || (cfg?.enabled && attachments.length > 0 && reply.hits.length > 0)) {
          try {
            const ai = await composeHelpWithAI({
              query: displayQ,
              pathname,
              hits: reply.hits,
              sessionId: sid,
              attachments: attPayload,
            });
            if (ai?.used_ai && ai.message.trim()) {
              if (ai.session_id) setSessionId(ai.session_id);
              reply = {
                ...reply,
                message: ai.message.trim(),
                usedAi: true,
                sessionId: ai.session_id,
              };
              setAiEnabled(true);
            }
          } catch {
            // Keep deterministic local reply.
          }
        } else if (cfg?.enabled && attachments.length > 0 && reply.hits.length === 0) {
          // No KB hits but files attached: use a synthetic hit-free path via local message
          reply = {
            query: displayQ,
            hits: [],
            fallback: false,
            message:
              "I read your file(s), but need a clearer question tied to Bluearm guides — or ask about cash/overdue/stock for live data.",
            usedAi: false,
          };
        }
        const assistantMsg: HelpChatMessage = { id: nextId(), role: "assistant", reply };
        setMessages((prev) => [...prev, assistantMsg]);
        void refreshSessions();
      } finally {
        setBusy(false);
        setStreamingText("");
      }
    })();
  };

  const clear = () => newChat();

  return {
    messages,
    busy,
    aiEnabled,
    streamingText,
    sessionId,
    sessions,
    sessionsOpen,
    setSessionsOpen,
    maximized,
    setMaximized,
    refreshAIConfig,
    refreshSessions,
    ask,
    clear,
    newChat,
    loadSession,
    removeSession,
  };
}
