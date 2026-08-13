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
  createChatChannel,
  createOrGetDM,
  downloadChatAttachment,
  getChatMessage,
  listChatChannels,
  listChatMessages,
  listChatUsers,
  markChatRead,
  postChatMessage,
  searchChatDocs,
  uploadChatAttachment,
  type ChatChannel,
  type ChatMessage,
  type ChatMessageLink,
  type ChatUser,
  type DocSearchHit,
} from "./chatApi";

type PendingLink = { entity_type: string; entity_id?: number | null; label: string; href: string };

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
  const [pageVisible, setPageVisible] = createSignal(typeof document === "undefined" ? true : document.visibilityState === "visible");

  const meId = () => auth.me?.user?.id ?? 0;

  const selected = createMemo(() => channels().find((c) => c.id === selectedId()) ?? null);

  const filteredChannels = createMemo(() => {
    const q = filter().trim().toLowerCase();
    const rows = channels();
    if (!q) return rows;
    return rows.filter((c) => c.name.toLowerCase().includes(q) || (c.last_message_preview ?? "").toLowerCase().includes(q));
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

  const loadMessages = async (channelId: number) => {
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
  };

  const selectChannel = (id: number) => {
    setSelectedId(id);
    setMobileShowThread(true);
    void loadMessages(id);
  };

  onMount(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    onCleanup(() => document.removeEventListener("visibilitychange", onVis));

    void (async () => {
      await refreshChannels();
      const u = await listChatUsers("");
      if (u.success) setUsers(u.data ?? []);

      const mid = Number(params.messageId || 0);
      const cid = Number(params.channelId || 0);
      if (mid > 0) {
        const msg = await getChatMessage(mid);
        if (msg.success && msg.data) {
          selectChannel(msg.data.channel_id);
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
          setMessages(res.data);
          void refreshChannels();
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
    setSending(false);
    await loadMessages(id);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
    if (e.key === "@") {
      setMentionOpen(true);
      setMentionQ("");
    }
    if (e.key === "Escape") setMentionOpen(false);
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
    const at = cur.lastIndexOf("@");
    const next = at >= 0 ? `${cur.slice(0, at)}@${u.full_name} ` : `${cur}@${u.full_name} `;
    setDraft(next);
    setMentionOpen(false);
  };

  const onPickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...pendingFiles(), ...Array.from(files)];
    const total = next.reduce((s, f) => s + f.size, 0);
    if (total > CHAT_MAX_ATTACH_BYTES) {
      toast.error(`Combined attachments must stay under 25 MB (${formatFileSize(CHAT_MAX_ATTACH_BYTES - pendingBytes())} remaining).`);
      return;
    }
    setPendingFiles(next);
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
          <For each={(["channel", "group", "dm"] as const)}>
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
                        <span class="ml-2 animate-[fadeIn_0.2s_ease] rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
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
        class={`min-w-0 flex-1 flex-col ${
          !mobileShowThread() && selectedId() ? "hidden md:flex" : "flex"
        }`}
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
              <header class="flex items-center gap-2 border-b border-stroke px-3 py-2">
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
                      class={`animate-[fadeIn_0.25s_ease] rounded-lg px-2 py-1.5 ${
                        m.sender_user_id === meId() ? "bg-brand-50/60" : ""
                      }`}
                    >
                      <Show
                        when={!m.deleted_at}
                        fallback={<p class="text-sm italic text-text-secondary">Message removed</p>}
                      >
                        <div class="mb-0.5 flex flex-wrap items-baseline gap-2">
                          <span class={`text-sm ${m.sender_user_id === meId() ? "font-semibold" : "font-medium"} text-text-primary`}>
                            {m.sender_user_id === meId() ? "You" : m.sender_name || "User"}
                          </span>
                          <span class="text-[11px] text-text-secondary">{crmNotificationRelativeTime(m.created_at)}</span>
                        </div>
                        <p
                          class="whitespace-pre-wrap text-sm text-text-primary"
                          // Mentions are escaped then wrapped; body is never raw HTML from server.
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
                                  <span class="shrink-0 text-xs text-text-secondary">{formatFileSize(att.size_bytes)}</span>
                                </button>
                              )}
                            </For>
                          </div>
                        </Show>
                      </Show>
                    </article>
                  )}
                </For>
              </div>

              <div class="border-t border-stroke p-3">
                <Show when={pendingLinks().length > 0 || pendingFiles().length > 0}>
                  <div class="mb-2 flex flex-wrap gap-1">
                    <For each={pendingLinks()}>
                      {(l, i) => (
                        <span class="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-0.5 text-xs">
                          {l.label}
                          <button type="button" aria-label="Remove document" onClick={() => setPendingLinks((p) => p.filter((_, idx) => idx !== i()))}>
                            ×
                          </button>
                        </span>
                      )}
                    </For>
                    <For each={pendingFiles()}>
                      {(f, i) => (
                        <span class="inline-flex items-center gap-1 rounded-full border border-stroke bg-white px-2 py-0.5 text-xs">
                          {f.name}
                          <button type="button" aria-label="Remove file" onClick={() => setPendingFiles((p) => p.filter((_, idx) => idx !== i()))}>
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
                <label class="sr-only" for="team-chat-composer">
                  Message
                </label>
                <textarea
                  id="team-chat-composer"
                  class="mb-2 w-full rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  rows={3}
                  placeholder="Write a message… Enter to send, Shift+Enter for newline. Type @ to mention."
                  value={draft()}
                  onInput={(e) => {
                    setDraft(e.currentTarget.value);
                    const v = e.currentTarget.value;
                    const m = v.match(/@([^\s@]*)$/);
                    if (m) {
                      setMentionOpen(true);
                      setMentionQ(m[1] ?? "");
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={sending()}
                />
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="min-h-10 rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium"
                    aria-label="Mention teammate"
                    onClick={() => {
                      setMentionOpen(true);
                      setMentionQ("");
                    }}
                  >
                    @
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
                  Attach source documents (SO, PO, invoice, etc.) — Load Slip is a form tool, not a chat attachment.{" "}
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
                  {(u) => <option value={u.id}>{u.full_name}</option>}
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
                    <button type="button" class="block w-full border-b border-stroke px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => attachDoc(hit)}>
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
                <button type="button" class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white" onClick={() => void handleCreate()}>
                  Create
                </button>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
