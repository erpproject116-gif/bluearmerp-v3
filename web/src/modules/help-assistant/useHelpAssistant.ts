import { createSignal } from "solid-js";
import { composeHelpReply } from "./composeHelpReply";
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

  const ask = (text: string) => {
    const q = text.trim();
    if (!q || busy()) return;
    const userMsg: HelpChatMessage = { id: nextId(), role: "user", text: q };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    try {
      const reply: HelpReply = composeHelpReply(q, getPathname());
      const assistantMsg: HelpChatMessage = { id: nextId(), role: "assistant", reply };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setBusy(false);
    }
  };

  const clear = () => setMessages([]);

  return {
    open,
    setOpen,
    messages,
    busy,
    ask,
    clear,
  };
}
