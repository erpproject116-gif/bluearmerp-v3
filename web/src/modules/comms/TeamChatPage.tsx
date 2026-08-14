import { A, useNavigate, useSearchParams } from "@solidjs/router";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { useAuth } from "../../shared/auth-context";
import { LoadingText } from "../../shared/LoadingText";
import { useToast } from "../../shared/toast";
import { crmNotificationRelativeTime } from "../../shared/crmNotificationRoutes";
import { formatFileSize } from "../../shared/attachments";
import {
  CHAT_ENTITY_TYPES,
  CHAT_MAX_ATTACH_BYTES,
  CHAT_REACTION_EMOJIS,
  addChatReaction,
  cancelChatReminder,
  createChatChannel,
  createChatReminder,
  createOrGetDM,
  downloadChatAttachment,
  fetchBaikoCapabilities,
  fetchDueChatReminders,
  forwardChatMessage,
  getChatMessage,
  listChatChannels,
  listChatMessages,
  listChatReminders,
  listChatTyping,
  listChatUsers,
  markChatRead,
  postBaikoChatMessage,
  postChatMessage,
  postChatSlash,
  postChatTyping,
  removeChatReaction,
  searchChatDocs,
  uploadChatAttachment,
  type ChatActionDraft,
  type ChatChannel,
  type ChatMessage,
  type ChatMessageLink,
  type ChatReminder,
  type ChatTypingUser,
  type ChatUser,
  type DocSearchHit,
} from "./chatApi";
import { askCopilot } from "../help-assistant/helpApi";
import {
  approveAndOpenCopilotDraft,
  isNavigateOnlyDraftType,
  navigateOnlySafeAppPath,
} from "../../shared/copilotApproveHandoff";
import { safeAppPath } from "../help-assistant/safeAppPath";

type PendingLink = { entity_type: string; entity_id?: number | null; label: string; href: string };

type SlashItem = { command: string; label: string; baikoOnly?: boolean };

const SLASH_ITEMS: SlashItem[] = [
  { command: "reminder", label: "Schedule a reminder" },
  { command: "baiko", label: "Ask Baiko", baikoOnly: true },
  { command: "ask", label: "Ask Baiko (free text)", baikoOnly: true },
  { command: "analyze", label: "Analyze linked docs", baikoOnly: true },
  { command: "quotation", label: "Open new quotation", baikoOnly: true },
  { command: "sales-order", label: "Open new sales order", baikoOnly: true },
  { command: "sales", label: "Open new sales invoice", baikoOnly: true },
  { command: "purchase-request", label: "Open purchase request", baikoOnly: true },
  { command: "purchase-order", label: "Open purchase order", baikoOnly: true },
  { command: "rfq", label: "Open RFQ", baikoOnly: true },
  { command: "purchase", label: "Open supplier invoice", baikoOnly: true },
  { command: "ticket", label: "Open support tickets", baikoOnly: true },
  { command: "crm", label: "Open CRM leads", baikoOnly: true },
];

const BUBBLE_TAILS_KEY = "bluearm.chat.bubbleTails";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBodyWithMentions(body: string, users: ChatUser[]): string {
  const byName = new Map(users.map((u) => [u.full_name.toLowerCase(), u]));
  const parts = escapeHtml(body).split(/(@[\w.\- ]{1,80})/g);
  return parts
    .map((p) => {
      if (!p.startsWith("@")) return p;
      const name = p.slice(1).trim().toLowerCase();
      if (byName.has(name) || p.length > 1) {
        return `<span class="rounded bg-brand-50 px-1 font-medium text-brand-700">${p}</span>`;
      }
      return p;
    })
    .join("");
}

function readBubbleTails(): boolean {
  try {
    const v = localStorage.getItem(BUBBLE_TAILS_KEY);
    if (v === null) return true;
    return v !== "0";
  } catch {
    return true;
  }
}

export default function TeamChatPage() {
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [channels, setChannels] = createSignal<ChatChannel[]>([]);
  const [loadingChannels, setLoadingChannels] = createSignal(true);
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const [users, setUsers] = createSignal<ChatUser[]>([]);
  const [filter, setFilter] = createSignal("");
  const [mobileShowThread, setMobileShowThread] = createSignal(false);
  const [pendingFiles, setPendingFiles] = createSignal<File[]>([]);
  const [pendingLinks, setPendingLinks] = createSignal<PendingLink[]>([]);
  const [mentionOpen, setMentionOpen] = createSignal(false);
  const [mentionQ, setMentionQ] = createSignal("");
  const [mentionIds, setMentionIds] = createSignal<number[]>([]);
  const [showCreate, setShowCreate] = createSignal<"channel" | "group" | "dm" | "doc" | null>(null);
  const [createName, setCreateName] = createSignal("");
  const [dmUserId, setDmUserId] = createSignal<number | null>(null);
  const [docType, setDocType] = createSignal("quo_quotation");
  const [docQ, setDocQ] = createSignal("");
  const [docHits, setDocHits] = createSignal<DocSearchHit[]>([]);
  const [pageVisible, setPageVisible] = createSignal(
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [replyTo, setReplyTo] = createSignal<ChatMessage | null>(null);
  const [forwardMsg, setForwardMsg] = createSignal<ChatMessage | null>(null);
  const [forwardChannelId, setForwardChannelId] = createSignal<number | null>(null);
  const [bubbleTails, setBubbleTails] = createSignal(readBubbleTails());
  const [menuOpen, setMenuOpen] = createSignal(false);
  const [typers, setTypers] = createSignal<ChatTypingUser[]>([]);
  const [canBaikoSlash, setCanBaikoSlash] = createSignal(false);
  const [slashOpen, setSlashOpen] = createSignal(false);
  const [slashQ, setSlashQ] = createSignal("");
  const [reminderOpen, setReminderOpen] = createSignal(false);
  const [reminderTitle, setReminderTitle] = createSignal("");
  const [reminderAt, setReminderAt] = createSignal("");
  const [reminderNotify, setReminderNotify] = createSignal(true);
  const [reminderCrm, setReminderCrm] = createSignal(false);
  const [pendingApprove, setPendingApprove] = createSignal<{
    navigate?: string;
    hint?: string;
    draft?: ChatActionDraft | null;
  } | null>(null);
  const [highlightId, setHighlightId] = createSignal<number | null>(null);
  const [remindersOpen, setRemindersOpen] = createSignal(false);
  const [reminders, setReminders] = createSignal<ChatReminder[]>([]);
  let messagesEndEl: HTMLDivElement | undefined;

  const meId = () => auth.me?.user?.id ?? 0;
  const selected = createMemo(() => channels().find((c) => c.id === selectedId()) ?? null);

  const filteredChannels = createMemo(() => {
    const q = filter().trim().toLowerCase();
    const rows = channels();
    if (!q) return rows;
    return rows.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q),
    );
  });

  const channelsBySection = createMemo(() => {
    const rows = filteredChannels();
    return {
      channel: rows.filter((c) => c.type === "channel"),
      group: rows.filter((c) => c.type === "group"),
      dm: rows.filter((c) => c.type === "dm"),
    };
  });

  const pendingBytes = createMemo(() => pendingFiles().reduce((s, f) => s + f.size, 0));
  const remainingBytes = createMemo(() => CHAT_MAX_ATTACH_BYTES - pendingBytes());

  const mentionCandidates = createMemo(() => {
    const q = mentionQ().toLowerCase();
    return users().filter(
      (u) => u.id !== meId() && (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
    );
  });

  const slashCandidates = createMemo(() => {
    const q = slashQ().toLowerCase();
    return SLASH_ITEMS.filter((item) => {
      if (item.baikoOnly && !canBaikoSlash()) return false;
      if (!q) return true;
      return item.command.includes(q) || item.label.toLowerCase().includes(q);
    });
  });

  const refreshChannels = async () => {
    const res = await listChatChannels();
    if (!res.success) {
      if (loadingChannels()) toast.error(res.message || "Failed to load channels.");
      setLoadingChannels(false);
      return;
    }
    setChannels(res.data ?? []);
    setLoadingChannels(false);
  };

  const scrollMessagesToEnd = () => {
    queueMicrotask(() => {
      messagesEndEl?.scrollIntoView({ block: "end" });
    });
  };

  const loadMessages = async (channelId: number, opts?: { highlightId?: number }) => {
    setLoadingMsgs(true);
    const res = await listChatMessages(channelId);
    setLoadingMsgs(false);
    if (!res.success) {
      toast.error(res.message || "Failed to load messages.");
      return;
    }
    setMessages(res.data ?? []);
    const last = (res.data ?? []).at(-1);
    void markChatRead(channelId, last?.id);
    void refreshChannels();
    scrollMessagesToEnd();
    if (opts?.highlightId) {
      setHighlightId(opts.highlightId);
      queueMicrotask(() => {
        document.getElementById(`chat-msg-${opts.highlightId}`)?.scrollIntoView({ block: "center" });
      });
      window.setTimeout(() => setHighlightId(null), 3000);
    }
  };

  const selectChannel = (id: number, highlightMessageId?: number) => {
    setSelectedId(id);
    setMobileShowThread(true);
    setReplyTo(null);
    setPendingApprove(null);
    setMentionOpen(false);
    setSlashOpen(false);
    void loadMessages(id, highlightMessageId ? { highlightId: highlightMessageId } : undefined);
  };

  const toggleBubbleTails = () => {
    setBubbleTails((v) => {
      const next = !v;
      try {
        localStorage.setItem(BUBBLE_TAILS_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const signalTyping = (() => {
    let last = 0;
    return () => {
      const id = selectedId();
      if (!id) return;
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      void postChatTyping(id);
    };
  })();

  onMount(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    onCleanup(() => document.removeEventListener("visibilitychange", onVis));

    void (async () => {
      await refreshChannels();
      const u = await listChatUsers("");
      if (u.success) setUsers(u.data ?? []);
      const caps = await fetchBaikoCapabilities();
      if (caps.success && caps.data) setCanBaikoSlash(Boolean(caps.data.can_use_baiko_slash));

      const due = await fetchDueChatReminders();
      if (due.success && (due.data?.length ?? 0) > 0) {
        for (const rem of due.data ?? []) {
          toast.success(`Reminder: ${rem.title}`);
        }
      }

      const mid = Number(params.messageId || 0);
      const cid = Number(params.channelId || 0);
      if (mid > 0) {
        const msg = await getChatMessage(mid);
        if (msg.success && msg.data) {
          selectChannel(msg.data.channel_id, mid);
          return;
        }
      }
      if (cid > 0) {
        selectChannel(cid);
        return;
      }
      const first = (await listChatChannels()).data?.[0];
      if (first) selectChannel(first.id);
    })();
  });

  createEffect(() => {
    const id = selectedId();
    if (!id) return;
    const interval = pageVisible() ? 4000 : 30000;
    const t = window.setInterval(() => {
      void listChatMessages(id).then((res) => {
        if (res.success && res.data) {
          const prevLast = messages().at(-1)?.id ?? 0;
          const nextLast = res.data.at(-1)?.id ?? 0;
          setMessages(res.data);
          void refreshChannels();
          if (nextLast > prevLast) scrollMessagesToEnd();
        }
      });
      void listChatTyping(id).then((res) => {
        if (res.success) setTypers(res.data ?? []);
      });
      void fetchDueChatReminders().then((res) => {
        if (res.success && (res.data?.length ?? 0) > 0) {
          for (const rem of res.data ?? []) toast.success(`Reminder: ${rem.title}`);
        }
      });
    }, interval);
    onCleanup(() => window.clearInterval(t));
  });

  const handleSend = async () => {
    const id = selectedId();
    if (!id || sending()) return;
    const text = draft().trim();
    const links = pendingLinks();
    const files = pendingFiles();
    if (!text && links.length === 0 && files.length === 0) return;
    if (pendingBytes() > CHAT_MAX_ATTACH_BYTES) {
      toast.error("Attachments must stay under 25 MB combined.");
      return;
    }
    setSending(true);
    const res = await postChatMessage(id, {
      body: text || (links.length ? "Shared a document" : "Shared a file"),
      mention_ids: mentionIds(),
      parent_message_id: replyTo()?.id ?? null,
      links: links.map((l) => ({
        entity_type: l.entity_type,
        entity_id: l.entity_id ?? null,
        label: l.label,
      })),
    });
    if (!res.success || !res.data) {
      setSending(false);
      toast.error(res.message || "Failed to send.");
      return;
    }
    const msgId = res.data.id;
    for (const f of files) {
      const up = await uploadChatAttachment(msgId, f);
      if (!up.success) {
        toast.error(up.message || `Failed to upload ${f.name}`);
        break;
      }
    }
    setDraft("");
    setPendingFiles([]);
    setPendingLinks([]);
    setMentionIds([]);
    setReplyTo(null);
    setMentionOpen(false);
    setSlashOpen(false);
    setSending(false);
    await loadMessages(id);
  };

  const approveChatDraft = async (draft: ChatActionDraft | null | undefined, navigateFallback?: string) => {
    if (!draft?.type) {
      const next = navigateFallback ? safeAppPath(navigateFallback) : null;
      if (next) window.location.assign(next);
      return;
    }
    if (isNavigateOnlyDraftType(draft.type)) {
      const href = draft.navigate || navigateFallback || "";
      if (!navigateOnlySafeAppPath(href)) {
        toast.error("Invalid destination.");
      }
      return;
    }
    const outcome = await approveAndOpenCopilotDraft({
      type: draft.type,
      summary: draft.summary || draft.type,
      payload: draft.payload ?? {},
      api: draft.api,
      method: draft.method,
    });
    if (!outcome.ok) {
      toast.error(outcome.message);
      return;
    }
    if (!outcome.assigned && outcome.next) {
      window.location.assign(outcome.next);
    } else if (!outcome.assigned && !outcome.next && navigateFallback) {
      const next = safeAppPath(navigateFallback);
      if (next) window.location.assign(next);
    }
  };

  const runClientAsk = async (channelId: number, query: string, analyze: boolean) => {
    const entities = analyze
      ? messages()
          .flatMap((m) => m.links ?? [])
          .filter((l) => l.entity_id != null && l.entity_id > 0)
          .slice(0, 20)
          .map((l) => ({
            type: l.entity_type,
            id: Number(l.entity_id),
            label: l.label,
          }))
      : [];
    const ask = await askCopilot({
      query,
      pathname: "/app/comms/chat",
      entities,
    });
    if (!ask) {
      const stub =
        "Baiko is not enabled or briefly unavailable. Open Baiko to continue with grounded tools — nothing is auto-posted from chat.";
      await postBaikoChatMessage(channelId, stub, {
        type: "open_baiko",
        summary: "Continue in Baiko",
        payload: {},
        navigate: "/app/baiko",
      });
      return;
    }
    let draft: ChatActionDraft | null = null;
    if (ask.action_draft?.type) {
      draft = {
        type: ask.action_draft.type,
        summary: ask.action_draft.summary,
        payload: ask.action_draft.payload ?? {},
        api: ask.action_draft.api,
        method: ask.action_draft.method,
      };
    }
    const body = (ask.message || "").trim() || "Baiko had no text reply.";
    await postBaikoChatMessage(channelId, body.slice(0, 8000), draft);
  };

  const runSlash = async (command: string, args = "") => {
    const id = selectedId();
    if (!id) return;
    if (command === "reminder") {
      setSlashOpen(false);
      setDraft("");
      setReminderOpen(true);
      return;
    }
    setSending(true);
    const res = await postChatSlash(id, command, args);
    if (!res.success) {
      setSending(false);
      toast.error(res.message || "Slash command failed.");
      return;
    }
    const data = res.data;
    setSlashOpen(false);
    setDraft("");
    if (data?.need_client_ask && data.ask_query) {
      await runClientAsk(id, data.ask_query, Boolean(data.analyze));
      setSending(false);
      await loadMessages(id);
      return;
    }
    setSending(false);
    if (data?.action_draft || data?.navigate) {
      setPendingApprove({
        navigate: data.navigate,
        hint: data.approve_hint,
        draft: data.action_draft ?? null,
      });
    }
    await loadMessages(id);
  };

  const openRemindersList = async () => {
    const res = await listChatReminders();
    if (res.success) setReminders(res.data ?? []);
    setRemindersOpen(true);
    setMenuOpen(false);
  };

  const handleComposerInput = (value: string) => {
    setDraft(value);
    signalTyping();
    const trimmed = value.trimStart();
    if (trimmed.startsWith("/")) {
      const rest = trimmed.slice(1);
      const space = rest.search(/\s/);
      setSlashOpen(true);
      setSlashQ(space >= 0 ? rest.slice(0, space) : rest);
      setMentionOpen(false);
      return;
    }
    setSlashOpen(false);
    // Only treat "@…" as a mention when @ starts a token (not mid-email like name@domain.com).
    const m = value.match(/(?:^|[\s([{])@([^\s@]*)$/);
    if (m) {
      setMentionOpen(true);
      setMentionQ(m[1] ?? "");
    } else {
      setMentionOpen(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = draft().trim();
      if (trimmed.startsWith("/") && slashOpen() && slashCandidates()[0]) {
        const item = slashCandidates()[0]!;
        const args = trimmed.replace(new RegExp(`^/${item.command}\\s*`, "i"), "").trim();
        void runSlash(item.command, args);
        return;
      }
      void handleSend();
    }
    if (e.key === "Escape") {
      setMentionOpen(false);
      setSlashOpen(false);
    }
  };

  const handleCreate = async () => {
    const mode = showCreate();
    if (mode === "dm") {
      const uid = dmUserId();
      if (!uid) {
        toast.error("Pick a teammate.");
        return;
      }
      const res = await createOrGetDM(uid);
      if (!res.success || !res.data) {
        toast.error(res.message || "Failed to open DM.");
        return;
      }
      setShowCreate(null);
      await refreshChannels();
      selectChannel(res.data.id);
      return;
    }
    if (mode === "channel" || mode === "group") {
      const name = createName().trim();
      if (mode === "channel" && !name) {
        toast.error("Channel name is required.");
        return;
      }
      const res = await createChatChannel({
        type: mode,
        name: name || "Group chat",
        is_private: mode === "group",
      });
      if (!res.success || !res.data) {
        toast.error(res.message || "Failed to create.");
        return;
      }
      setShowCreate(null);
      setCreateName("");
      await refreshChannels();
      selectChannel(res.data.id);
    }
  };

  const handleDocSearch = async () => {
    const res = await searchChatDocs(docType(), docQ());
    if (!res.success) {
      toast.error(res.message || "Search failed.");
      return;
    }
    setDocHits(res.data ?? []);
  };

  const attachDoc = (hit: DocSearchHit) => {
    setPendingLinks((prev) => [
      ...prev,
      {
        entity_type: hit.entity_type,
        entity_id: hit.entity_id || null,
        label: hit.label,
        href: hit.href,
      },
    ]);
    setShowCreate(null);
    setDocHits([]);
  };

  const addMention = (u: ChatUser) => {
    setMentionIds((ids) => (ids.includes(u.id) ? ids : [...ids, u.id]));
    const cur = draft();
    // Replace the active @token (after whitespace/start), not an email domain.
    const next = cur.replace(/(?:^|[\s([{])@([^\s@]*)$/, (full) => {
      const prefix = full.startsWith("@") ? "" : full[0]!;
      return `${prefix}@${u.full_name} `;
    });
    setDraft(next === cur ? `${cur.replace(/\s*$/, "")}${cur ? " " : ""}@${u.full_name} ` : next);
    setMentionOpen(false);
    setMentionQ("");
    queueMicrotask(() => document.getElementById("team-chat-composer")?.focus());
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...pendingFiles(), ...Array.from(files)];
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > CHAT_MAX_ATTACH_BYTES) {
      toast.error(
        `Combined attachments must stay under 25 MB (${formatFileSize(CHAT_MAX_ATTACH_BYTES - pendingBytes())} remaining).`,
      );
      return;
    }
    setPendingFiles(next);
  };

  const toggleReaction = async (m: ChatMessage, emoji: string) => {
    const mine = m.reactions?.find((r) => r.emoji === emoji && r.me);
    const res = mine ? await removeChatReaction(m.id, emoji) : await addChatReaction(m.id, emoji);
    if (!res.success) {
      toast.error(res.message || "Failed to react.");
      return;
    }
    const id = selectedId();
    if (id) await loadMessages(id);
  };

  const handleForward = async () => {
    const msg = forwardMsg();
    const chId = forwardChannelId();
    if (!msg || !chId) return;
    const res = await forwardChatMessage(msg.id, chId);
    if (!res.success) {
      toast.error(res.message || "Forward failed.");
      return;
    }
    toast.success("Message forwarded.");
    setForwardMsg(null);
    await refreshChannels();
    selectChannel(chId);
  };

  const handleCreateReminder = async () => {
    const title = reminderTitle().trim();
    if (!title) {
      toast.error("Title is required.");
      return;
    }
    const local = reminderAt().trim();
    if (!local) {
      toast.error("When is required.");
      return;
    }
    const remindAt = new Date(local).toISOString();
    const res = await createChatReminder({
      title,
      remind_at: remindAt,
      channel_id: selectedId(),
      notify_channel: reminderNotify(),
      also_crm_task: reminderCrm(),
    });
    if (!res.success) {
      toast.error(res.message || "Failed to schedule reminder.");
      return;
    }
    toast.success("Reminder scheduled.");
    setReminderOpen(false);
    setReminderTitle("");
    setReminderAt("");
    const id = selectedId();
    if (id) await loadMessages(id);
  };

  const senderLabel = (m: ChatMessage) => {
    if (m.sender_kind === "baiko") return "Baiko";
    if (m.sender_kind === "system") return "System";
    if (m.sender_user_id === meId()) return "You";
    return m.sender_name || "User";
  };

  const messageShellClass = (m: ChatMessage) => {
    if (!bubbleTails()) {
      return m.sender_user_id === meId() ? "bg-brand-50/60" : "";
    }
    if (m.sender_kind === "baiko") return "ml-0 mr-8 rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2";
    if (m.sender_kind === "system") return "mx-auto max-w-[90%] rounded-lg bg-amber-50 px-3 py-2 text-center";
    if (m.sender_user_id === meId()) {
      return "ml-8 mr-0 rounded-2xl rounded-br-md bg-brand-100 px-3 py-2";
    }
    return "ml-0 mr-8 rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2";
  };

  return (
    <div class="flex h-[calc(100vh-8rem)] min-h-[28rem] overflow-hidden rounded-xl border border-stroke bg-surface">
      <aside
        class={`w-full shrink-0 border-r border-stroke md:w-[260px] ${
          mobileShowThread() && selectedId() ? "hidden md:flex" : "flex"
        } flex-col`}
      >
        <div class="border-b border-stroke p-3">
          <div class="mb-2 flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-text-primary">Team Chat</h2>
            <div class="flex gap-1">
              <button
                type="button"
                class="rounded-lg border border-stroke px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                aria-label="New channel"
                onClick={() => setShowCreate("channel")}
              >
                + Channel
              </button>
              <button
                type="button"
                class="rounded-lg border border-stroke px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                aria-label="Message teammate"
                onClick={() => setShowCreate("dm")}
              >
                DM
              </button>
            </div>
          </div>
          <input
            class="w-full rounded-lg border border-stroke px-2 py-1.5 text-sm"
            placeholder="Filter conversations"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            aria-label="Filter conversations"
          />
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <Show when={loadingChannels()}>
            <LoadingText />
          </Show>
          <Show when={!loadingChannels() && channels().length === 0}>
            <p class="px-2 py-4 text-sm text-text-secondary">No conversations yet.</p>
            <button
              type="button"
              class="mx-2 mb-2 w-[calc(100%-1rem)] rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white"
              onClick={() => setShowCreate("channel")}
            >
              Create channel
            </button>
            <button
              type="button"
              class="mx-2 w-[calc(100%-1rem)] rounded-lg border border-stroke px-3 py-2 text-sm font-medium"
              onClick={() => setShowCreate("dm")}
            >
              Message a teammate
            </button>
          </Show>
          <For each={["channel", "group", "dm"] as const}>
            {(section) => (
              <Show when={channelsBySection()[section].length > 0}>
                <p class="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  {section === "channel" ? "Channels" : section === "group" ? "Groups" : "Direct messages"}
                </p>
                <For each={channelsBySection()[section]}>
                  {(ch) => (
                    <button
                      type="button"
                      class={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm transition ${
                        selectedId() === ch.id ? "bg-brand-50 text-brand-800" : "hover:bg-slate-50"
                      }`}
                      onClick={() => selectChannel(ch.id)}
                      aria-current={selectedId() === ch.id ? "true" : undefined}
                    >
                      <span class={`truncate ${ch.unread_count > 0 ? "font-semibold" : ""}`}>
                        {ch.type === "channel" ? `# ${ch.name}` : ch.name}
                      </span>
                      <Show when={ch.unread_count > 0}>
                        <span class="ml-2 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                          {ch.unread_count > 99 ? "99+" : ch.unread_count}
                        </span>
                      </Show>
                    </button>
                  )}
                </For>
              </Show>
            )}
          </For>
          <button
            type="button"
            class="mt-3 w-full rounded-lg border border-dashed border-stroke px-2 py-2 text-xs text-text-secondary hover:bg-slate-50"
            onClick={() => setShowCreate("group")}
          >
            + New group
          </button>
        </div>
      </aside>

      <section
        class={`min-w-0 flex-1 flex-col ${!mobileShowThread() && selectedId() ? "hidden md:flex" : "flex"}`}
      >
        <Show
          when={selected()}
          fallback={
            <div class="flex flex-1 items-center justify-center p-6 text-sm text-text-secondary">
              Select a conversation or start a new one.
            </div>
          }
        >
          {(ch) => (
            <>
              <header class="relative flex items-center gap-2 border-b border-stroke px-3 py-2">
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-2 py-1 text-sm md:hidden"
                  aria-label="Back to conversations"
                  onClick={() => setMobileShowThread(false)}
                >
                  ←
                </button>
                <div class="min-w-0 flex-1">
                  <h3 class="truncate text-sm font-semibold text-text-primary">
                    {ch().type === "channel" ? `# ${ch().name}` : ch().name}
                  </h3>
                  <p class="text-xs text-text-secondary">{ch().member_count} members</p>
                </div>
                <button
                  type="button"
                  class="rounded-lg border border-stroke px-2 py-1 text-sm"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen()}
                  aria-label="Chat options"
                  onClick={() => setMenuOpen((v) => !v)}
                >
                  ⋯
                </button>
                <Show when={menuOpen()}>
                  <div
                    class="absolute right-3 top-12 z-10 min-w-[12rem] rounded-lg border border-stroke bg-white py-1 shadow-lg"
                    role="menu"
                  >
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                      role="menuitem"
                      onClick={() => {
                        toggleBubbleTails();
                        setMenuOpen(false);
                      }}
                    >
                      Bubble layout: {bubbleTails() ? "On" : "Off"}
                    </button>
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                      role="menuitem"
                      onClick={() => {
                        setReminderOpen(true);
                        setMenuOpen(false);
                      }}
                    >
                      Schedule reminder
                    </button>
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                      role="menuitem"
                      onClick={() => void openRemindersList()}
                    >
                      Reminders
                    </button>
                  </div>
                </Show>
              </header>

              <div class="flex-1 space-y-3 overflow-y-auto px-3 py-3" role="log" aria-live="polite">
                <Show when={loadingMsgs()}>
                  <LoadingText />
                </Show>
                <Show when={!loadingMsgs() && messages().length === 0}>
                  <p class="text-sm text-text-secondary">No messages yet — share an invoice or say hello.</p>
                </Show>
                <For each={messages()}>
                  {(m) => (
                    <article
                      id={`chat-msg-${m.id}`}
                      class={`group animate-[fadeIn_0.25s_ease] ${m.parent_message_id ? "ml-4 border-l-2 border-brand-200 pl-3" : ""} ${messageShellClass(m)} ${
                        highlightId() === m.id ? "ring-2 ring-brand-400 ring-offset-2" : ""
                      }`}
                    >
                      <Show
                        when={!m.deleted_at}
                        fallback={<p class="text-sm italic text-text-secondary">Message removed</p>}
                      >
                        <Show when={m.parent_preview}>
                          {(pv) => (
                            <div class="mb-1 rounded border border-stroke/80 bg-white/70 px-2 py-1 text-xs text-text-secondary">
                              <span class="font-medium text-text-primary">{pv().sender_name || "User"}</span>
                              <span class="ml-1">{pv().body}</span>
                            </div>
                          )}
                        </Show>
                        <Show when={m.forwarded_from_message_id}>
                          <p class="mb-0.5 text-[11px] italic text-text-secondary">Forwarded message</p>
                        </Show>
                        <div class="mb-0.5 flex flex-wrap items-baseline gap-2">
                          <span
                            class={`text-sm ${
                              m.sender_kind === "baiko"
                                ? "font-semibold text-brand-800"
                                : m.sender_user_id === meId()
                                  ? "font-semibold"
                                  : "font-medium"
                            } text-text-primary`}
                          >
                            {senderLabel(m)}
                          </span>
                          <span class="text-[11px] text-text-secondary">
                            {crmNotificationRelativeTime(m.created_at)}
                          </span>
                        </div>
                        <p
                          class="whitespace-pre-wrap text-sm text-text-primary"
                          innerHTML={renderBodyWithMentions(m.body, users())}
                        />
                        <Show when={(m.links?.length ?? 0) > 0}>
                          <div class="mt-2 space-y-1">
                            <For each={m.links ?? []}>
                              {(link: ChatMessageLink) => (
                                <div class="flex items-center justify-between gap-2 rounded-lg border border-stroke bg-white px-2 py-1.5 text-sm">
                                  <div class="min-w-0">
                                    <p class="truncate font-medium text-text-primary">{link.label}</p>
                                    <p class="truncate text-xs text-text-secondary">{link.entity_type}</p>
                                  </div>
                                  <button
                                    type="button"
                                    class="shrink-0 rounded-lg border border-stroke px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
                                    onClick={() => navigate(link.href)}
                                  >
                                    Open
                                  </button>
                                </div>
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={(m.attachments?.length ?? 0) > 0}>
                          <div class="mt-2 space-y-1">
                            <For each={m.attachments ?? []}>
                              {(att) => (
                                <button
                                  type="button"
                                  class="flex w-full items-center justify-between rounded-lg border border-stroke bg-white px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                                  onClick={() => void downloadChatAttachment(att)}
                                >
                                  <span class="truncate">{att.file_name}</span>
                                  <span class="shrink-0 text-xs text-text-secondary">
                                    {formatFileSize(att.size_bytes)}
                                  </span>
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                        <div class="mt-1 flex flex-wrap items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <For each={[...CHAT_REACTION_EMOJIS]}>
                            {(emoji) => (
                              <button
                                type="button"
                                class="rounded px-1 text-sm hover:bg-white/80"
                                aria-label={`React ${emoji}`}
                                onClick={() => void toggleReaction(m, emoji)}
                              >
                                {emoji}
                                <Show when={m.reactions?.find((r) => r.emoji === emoji)}>
                                  {(r) => <span class="ml-0.5 text-[10px]">{r().count}</span>}
                                </Show>
                              </button>
                            )}
                          </For>
                          <button
                            type="button"
                            class="rounded px-1.5 text-[11px] font-medium text-brand-700 hover:bg-white/80"
                            onClick={() => setReplyTo(m)}
                          >
                            Reply
                          </button>
                          <button
                            type="button"
                            class="rounded px-1.5 text-[11px] font-medium text-brand-700 hover:bg-white/80"
                            onClick={() => {
                              setForwardMsg(m);
                              setForwardChannelId(channels().find((c) => c.id !== selectedId())?.id ?? null);
                            }}
                          >
                            Forward
                          </button>
                        </div>
                        <Show when={(m.reactions?.length ?? 0) > 0}>
                          <div class="mt-1 flex flex-wrap gap-1">
                            <For each={m.reactions ?? []}>
                              {(r) => (
                                <button
                                  type="button"
                                  class={`rounded-full border px-1.5 text-xs ${
                                    r.me ? "border-brand-400 bg-brand-50" : "border-stroke bg-white"
                                  }`}
                                  aria-pressed={r.me}
                                  onClick={() => void toggleReaction(m, r.emoji)}
                                >
                                  {r.emoji} {r.count}
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={m.sender_kind === "baiko" && m.action_draft?.type}>
                          <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                            <p class="font-medium">
                              {m.action_draft!.summary || "Action draft — Approve to continue (nothing posted yet)"}
                            </p>
                            <button
                              type="button"
                              class="mt-2 rounded bg-brand-600 px-2 py-1 text-white"
                              onClick={() => void approveChatDraft(m.action_draft!, m.action_draft!.navigate)}
                            >
                              Approve to open
                            </button>
                          </div>
                        </Show>
                      </Show>
                    </article>
                  )}
                </For>
                <div ref={messagesEndEl} />
              </div>

              <div class="border-t border-stroke p-3">
                <Show when={pendingApprove()}>
                  {(pa) => (
                    <div class="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm">
                      <span class="flex-1 text-text-primary">
                        {pa().hint || "Approve to open the ERP screen — nothing is auto-posted."}
                      </span>
                      <button
                        type="button"
                        class="rounded-lg bg-brand-600 px-3 py-1 text-xs font-medium text-white"
                        onClick={() => {
                          void approveChatDraft(pa().draft, pa().navigate).then(() => setPendingApprove(null));
                        }}
                      >
                        Approve to open
                      </button>
                      <button
                        type="button"
                        class="rounded-lg border border-stroke px-2 py-1 text-xs"
                        onClick={() => setPendingApprove(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </Show>
                <Show when={replyTo()}>
                  {(m) => (
                    <div class="mb-2 flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/80 px-2 py-1.5 text-xs">
                      <div class="min-w-0 flex-1">
                        <span class="font-medium">Replying to {senderLabel(m())}</span>
                        <span class="ml-1 truncate text-text-secondary">{m().body.slice(0, 80)}</span>
                      </div>
                      <button type="button" aria-label="Cancel reply" onClick={() => setReplyTo(null)}>
                        ×
                      </button>
                    </div>
                  )}
                </Show>
                <Show when={pendingLinks().length > 0 || pendingFiles().length > 0}>
                  <div class="mb-2 flex flex-wrap gap-1">
                    <For each={pendingLinks()}>
                      {(l, i) => (
                        <span class="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-0.5 text-xs">
                          {l.label}
                          <button
                            type="button"
                            aria-label="Remove document"
                            onClick={() => setPendingLinks((p) => p.filter((_, idx) => idx !== i()))}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </For>
                    <For each={pendingFiles()}>
                      {(f, i) => (
                        <span class="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-0.5 text-xs">
                          {f.name}
                          <button
                            type="button"
                            aria-label="Remove file"
                            onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i()))}
                          >
                            ×
                          </button>
                        </span>
                      )}
                    </For>
                    <span class="text-xs text-text-secondary">
                      {formatFileSize(remainingBytes())} of 25 MB remaining
                    </span>
                  </div>
                </Show>
                <Show when={slashOpen()}>
                  <div class="mb-2 max-h-48 overflow-y-auto rounded-lg border border-stroke bg-white shadow-sm">
                    <For each={slashCandidates()} fallback={<p class="p-2 text-xs text-text-secondary">No commands</p>}>
                      {(item) => (
                        <button
                          type="button"
                          class="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                          onClick={() => {
                            const args = draft()
                              .trim()
                              .replace(new RegExp(`^/${item.command}\\s*`, "i"), "")
                              .trim();
                            void runSlash(item.command, args);
                          }}
                        >
                          <span class="font-medium">/{item.command}</span>
                          <span class="ml-2 text-text-secondary">{item.label}</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={mentionOpen()}>
                  <div class="mb-2 max-h-36 overflow-y-auto rounded-lg border border-stroke bg-white shadow-sm">
                    <For each={mentionCandidates()}>
                      {(u) => (
                        <button
                          type="button"
                          class="block w-full px-3 py-2 text-left text-sm hover:bg-brand-50"
                          onClick={() => addMention(u)}
                        >
                          {u.full_name} <span class="text-text-secondary">({u.email})</span>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
                <Show when={typers().length > 0}>
                  <p class="mb-1 text-xs text-text-secondary" aria-live="polite">
                    {typers()
                      .map((t) => t.full_name)
                      .join(", ")}{" "}
                    {typers().length === 1 ? "is" : "are"} typing…
                  </p>
                </Show>
                <label class="sr-only" for="team-chat-composer">
                  Message
                </label>
                <textarea
                  id="team-chat-composer"
                  class="mb-2 w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  rows={3}
                  placeholder={
                    canBaikoSlash()
                      ? "Message… / for Baiko skills & reminder, @ to mention"
                      : "Message… /reminder, @ to mention"
                  }
                  value={draft()}
                  onInput={(e) => handleComposerInput(e.currentTarget.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending()}
                />
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="min-h-10 rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium"
                    aria-label="Mention teammate"
                    onClick={() => {
                      const cur = draft();
                      const next = /(?:^|[\s([{])@$/.test(cur) || cur.endsWith("@") ? cur : `${cur}${cur && !/\s$/.test(cur) ? " " : ""}@`;
                      handleComposerInput(next);
                      queueMicrotask(() => document.getElementById("team-chat-composer")?.focus());
                    }}
                  >
                    @
                  </button>
                  <button
                    type="button"
                    class="min-h-10 rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium"
                    aria-label="Slash commands"
                    onClick={() => {
                      setDraft("/");
                      setSlashOpen(true);
                      setSlashQ("");
                    }}
                  >
                    /
                  </button>
                  <label class="min-h-10 cursor-pointer rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium">
                    Attach file
                    <input
                      type="file"
                      class="hidden"
                      multiple
                      onChange={(e) => {
                        onPickFiles(e.currentTarget.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    class="min-h-10 rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium"
                    aria-label="Attach ERP document"
                    onClick={() => {
                      setShowCreate("doc");
                      void handleDocSearch();
                    }}
                  >
                    Attach ERP doc
                  </button>
                  <button
                    type="button"
                    class="ml-auto min-h-10 rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    disabled={sending()}
                    onClick={() => void handleSend()}
                  >
                    {sending() ? "Sending…" : "Send"}
                  </button>
                </div>
                <p class="mt-2 text-xs text-text-secondary">
                  Attach source documents (SO, PO, invoice, etc.).{" "}
                  <A href="/app/comms/sent-documents" class="text-brand-700 underline">
                    Email inbox
                  </A>
                </p>
              </div>
            </>
          )}
        </Show>
      </section>

      <Show when={showCreate()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-4 shadow-lg">
            <Show when={showCreate() === "channel" || showCreate() === "group"}>
              <h3 class="mb-3 text-base font-semibold">{showCreate() === "group" ? "New group" : "New channel"}</h3>
              <input
                class="mb-3 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                placeholder={showCreate() === "group" ? "Group name (optional)" : "Channel name"}
                value={createName()}
                onInput={(e) => setCreateName(e.currentTarget.value)}
              />
            </Show>
            <Show when={showCreate() === "dm"}>
              <h3 class="mb-3 text-base font-semibold">Message a teammate</h3>
              <select
                class="mb-3 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={dmUserId() ?? ""}
                onChange={(e) => setDmUserId(Number(e.currentTarget.value) || null)}
              >
                <option value="">Select user…</option>
                <For each={users().filter((u) => u.id !== meId())}>
                  {(u) => (
                    <option value={u.id}>{u.full_name}</option>
                  )}
                </For>
              </select>
            </Show>
            <Show when={showCreate() === "doc"}>
              <h3 class="mb-3 text-base font-semibold">Attach ERP document</h3>
              <select
                class="mb-2 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                value={docType()}
                onChange={(e) => setDocType(e.currentTarget.value)}
              >
                <For each={CHAT_ENTITY_TYPES}>{(t) => <option value={t.value}>{t.label}</option>}</For>
              </select>
              <div class="mb-2 flex gap-2">
                <input
                  class="flex-1 rounded-lg border border-stroke px-3 py-2 text-sm"
                  placeholder="Search by number…"
                  value={docQ()}
                  onInput={(e) => setDocQ(e.currentTarget.value)}
                />
                <button type="button" class="rounded-lg border border-stroke px-3 text-sm" onClick={() => void handleDocSearch()}>
                  Search
                </button>
              </div>
              <div class="mb-3 max-h-48 overflow-y-auto rounded-lg border border-stroke">
                <For each={docHits()} fallback={<p class="p-3 text-sm text-text-secondary">No results</p>}>
                  {(hit) => (
                    <button
                      type="button"
                      class="block w-full border-b border-stroke px-3 py-2 text-left text-sm hover:bg-brand-50"
                      onClick={() => attachDoc(hit)}
                    >
                      {hit.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setShowCreate(null)}>
                Cancel
              </button>
              <Show when={showCreate() !== "doc"}>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                  onClick={() => void handleCreate()}
                >
                  Create
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>

      <Show when={forwardMsg()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Forward message">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-4 shadow-lg">
            <h3 class="mb-3 text-base font-semibold">Forward message</h3>
            <select
              class="mb-3 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={forwardChannelId() ?? ""}
              onChange={(e) => setForwardChannelId(Number(e.currentTarget.value) || null)}
            >
              <option value="">Select conversation…</option>
              <For each={channels()}>
                {(c) => (
                  <option value={c.id}>{c.type === "channel" ? `# ${c.name}` : c.name}</option>
                )}
              </For>
            </select>
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setForwardMsg(null)}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                disabled={!forwardChannelId()}
                onClick={() => void handleForward()}
              >
                Forward
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={reminderOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Schedule reminder">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-4 shadow-lg">
            <h3 class="mb-3 text-base font-semibold">Schedule reminder</h3>
            <label class="mb-1 block text-xs font-medium text-text-secondary" for="chat-rem-title">
              Title
            </label>
            <input
              id="chat-rem-title"
              class="mb-3 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={reminderTitle()}
              onInput={(e) => setReminderTitle(e.currentTarget.value)}
            />
            <label class="mb-1 block text-xs font-medium text-text-secondary" for="chat-rem-at">
              When
            </label>
            <input
              id="chat-rem-at"
              type="datetime-local"
              class="mb-3 w-full rounded-lg border border-stroke px-3 py-2 text-sm"
              value={reminderAt()}
              onInput={(e) => setReminderAt(e.currentTarget.value)}
            />
            <label class="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reminderNotify()} onChange={(e) => setReminderNotify(e.currentTarget.checked)} />
              Post in this channel when due
            </label>
            <label class="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reminderCrm()} onChange={(e) => setReminderCrm(e.currentTarget.checked)} />
              Also create CRM follow-up task
            </label>
            <div class="flex justify-end gap-2">
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setReminderOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => void handleCreateReminder()}
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      </Show>

      <Show when={remindersOpen()}>
        <div class="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label="Scheduled reminders">
          <div class="w-full max-w-md rounded-xl border border-stroke bg-white p-4 shadow-lg">
            <h3 class="mb-3 text-base font-semibold">Scheduled reminders</h3>
            <div class="mb-3 max-h-64 space-y-2 overflow-y-auto">
              <For
                each={reminders().filter((r) => r.status === "scheduled")}
                fallback={<p class="text-sm text-text-secondary">No scheduled reminders.</p>}
              >
                {(rem) => (
                  <div class="flex items-start justify-between gap-2 rounded-lg border border-stroke px-2 py-2 text-sm">
                    <div class="min-w-0">
                      <p class="font-medium text-text-primary">{rem.title}</p>
                      <p class="text-xs text-text-secondary">{rem.remind_at}</p>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 rounded border border-stroke px-2 py-1 text-xs"
                      onClick={async () => {
                        const res = await cancelChatReminder(rem.id);
                        if (!res.success) {
                          toast.error(res.message || "Cancel failed.");
                          return;
                        }
                        setReminders((prev) => prev.map((r) => (r.id === rem.id ? { ...r, status: "cancelled" } : r)));
                        toast.success("Reminder cancelled.");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </For>
            </div>
            <div class="flex justify-end">
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setRemindersOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
