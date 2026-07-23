import { useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { extractAttachment, type ExtractedAttachment } from "./extractAttachment";
import {
  formatEntityMention,
  searchCopilotEntities,
  type CopilotEntityRef,
} from "./helpApi";
import { HelpChatThread } from "./HelpChatThread";
import { suggestedPrompts } from "./helpRouteContext";
import type { useHelpAssistant } from "./useHelpAssistant";

type Assistant = ReturnType<typeof useHelpAssistant>;

function activeMention(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const frag = before.slice(at + 1);
  if (frag.includes("]") || /\s{2,}/.test(frag)) return null;
  if (frag.startsWith("[")) return null;
  return { start: at, query: frag };
}

export function HelpAssistantPanel(props: {
  open: boolean;
  onClose: () => void;
  assistant: Assistant;
}) {
  const loc = useLocation();
  const [draft, setDraft] = createSignal("");
  const [pendingFiles, setPendingFiles] = createSignal<ExtractedAttachment[]>([]);
  const [extracting, setExtracting] = createSignal(false);
  const [extractError, setExtractError] = createSignal("");
  const [mentionOpen, setMentionOpen] = createSignal(false);
  const [mentionItems, setMentionItems] = createSignal<CopilotEntityRef[]>([]);
  const [mentionIndex, setMentionIndex] = createSignal(0);
  const [mentionStart, setMentionStart] = createSignal(0);
  let scrollEl: HTMLDivElement | undefined;
  let inputEl: HTMLTextAreaElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let mentionTimer: number | undefined;

  createEffect(() => {
    if (props.open) {
      queueMicrotask(() => inputEl?.focus());
      props.assistant.refreshAIConfig();
      void props.assistant.refreshSessions();
    }
  });

  createEffect(() => {
    props.assistant.messages();
    props.assistant.streamingText();
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  onCleanup(() => {
    if (mentionTimer) window.clearTimeout(mentionTimer);
  });

  const submit = () => {
    const q = draft().trim();
    const files = pendingFiles();
    if (!q && !files.length) return;
    setMentionOpen(false);
    props.assistant.ask(q, files);
    setDraft("");
    setPendingFiles([]);
    setExtractError("");
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      if (mentionOpen()) {
        setMentionOpen(false);
        return;
      }
      if (props.assistant.maximized()) {
        props.assistant.setMaximized(false);
        return;
      }
      props.onClose();
    }
  };

  const scheduleMentionSearch = (text: string, caret: number) => {
    const active = activeMention(text, caret);
    if (!active) {
      setMentionOpen(false);
      return;
    }
    setMentionStart(active.start);
    if (active.query.trim().length < 1) {
      setMentionItems([]);
      setMentionOpen(false);
      return;
    }
    if (mentionTimer) window.clearTimeout(mentionTimer);
    mentionTimer = window.setTimeout(() => {
      void (async () => {
        const items = await searchCopilotEntities(active.query);
        setMentionItems(items);
        setMentionIndex(0);
        setMentionOpen(items.length > 0);
      })();
    }, 180);
  };

  const insertMention = (entity: CopilotEntityRef) => {
    const el = inputEl;
    const text = draft();
    const caret = el?.selectionStart ?? text.length;
    const active = activeMention(text, caret) ?? { start: mentionStart(), query: "" };
    const token = formatEntityMention(entity);
    const next = text.slice(0, active.start) + token + " " + text.slice(caret);
    setDraft(next);
    setMentionOpen(false);
    queueMicrotask(() => {
      if (!inputEl) return;
      const pos = active.start + token.length + 1;
      inputEl.focus();
      inputEl.setSelectionRange(pos, pos);
    });
  };

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setExtracting(true);
    setExtractError("");
    try {
      const next: ExtractedAttachment[] = [...pendingFiles()];
      for (const file of Array.from(list).slice(0, 4)) {
        const extracted = await extractAttachment(file);
        next.push(extracted);
      }
      setPendingFiles(next.slice(0, 4));
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Could not read file.");
    } finally {
      setExtracting(false);
      if (fileInput) fileInput.value = "";
    }
  };

  const panelStyle = () => {
    if (props.assistant.maximized()) {
      return {
        width: "min(72rem, calc(100vw - 2rem))",
        height: "min(48rem, calc(100vh - 2rem))",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        right: "auto",
        bottom: "auto",
        "max-height": "none",
      };
    }
    return {
      width: "min(26rem, calc(100vw - 2rem))",
      right: "1rem",
      bottom: "5.25rem",
      "max-height": "min(36rem, calc(100vh - 7rem))",
      left: "auto",
      top: "auto",
      transform: "none",
      height: "auto",
    };
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[60] bg-slate-900/40"
        role="presentation"
        onClick={props.onClose}
      />
      <section
        class="erp-surface fixed z-[61] flex overflow-hidden border border-stroke shadow-2xl"
        style={panelStyle()}
        aria-label="Bluearm Copilot"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <Show when={props.assistant.sessionsOpen()}>
          <aside class="flex w-56 shrink-0 flex-col border-r border-stroke bg-slate-50/80">
            <div class="flex items-center justify-between border-b border-stroke px-3 py-2">
              <span class="text-xs font-semibold uppercase tracking-wide text-text-secondary">History</span>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                onClick={() => props.assistant.setSessionsOpen(false)}
              >
                Close
              </button>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
              <For
                each={props.assistant.sessions()}
                fallback={<p class="px-2 py-3 text-xs text-text-secondary">No chats yet.</p>}
              >
                {(s) => (
                  <div class="mb-1 flex items-start gap-1 rounded-md hover:bg-white">
                    <button
                      type="button"
                      class="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs text-text-primary"
                      onClick={() => void props.assistant.loadSession(s.id)}
                    >
                      {s.title || "Untitled"}
                    </button>
                    <button
                      type="button"
                      class="shrink-0 px-1.5 py-1 text-[10px] text-text-secondary hover:text-red-600"
                      aria-label="Delete chat"
                      onClick={() => void props.assistant.removeSession(s.id)}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </For>
            </div>
          </aside>
        </Show>

        <div class="flex min-w-0 flex-1 flex-col">
          <header class="flex items-center justify-between gap-2 border-b border-stroke px-4 py-3">
            <div>
              <h2 class="text-sm font-semibold text-text-primary">Bluearm Copilot</h2>
              <p class="text-xs text-text-secondary">
                {props.assistant.aiEnabled()
                  ? "Guides, live data, @tags, files, and approve-to-act drafts"
                  : "In-app help"}
              </p>
            </div>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                onClick={() => {
                  props.assistant.setSessionsOpen(true);
                  void props.assistant.refreshSessions();
                }}
              >
                History
              </button>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                onClick={() => props.assistant.newChat()}
              >
                New
              </button>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                aria-label={props.assistant.maximized() ? "Restore" : "Maximize"}
                onClick={() => props.assistant.setMaximized(!props.assistant.maximized())}
              >
                {props.assistant.maximized() ? "▭" : "▣"}
              </button>
              <button
                type="button"
                class="rounded p-1 text-text-secondary hover:bg-slate-100 hover:text-text-primary"
                aria-label="Close"
                onClick={props.onClose}
              >
                ✕
              </button>
            </div>
          </header>

          <div ref={scrollEl} class="flex-1 overflow-y-auto px-4 py-3">
            <Show
              when={props.assistant.messages().length > 0}
              fallback={
                <div class="space-y-3 text-sm text-text-secondary">
                  <p>
                    Ask how Bluearm works, check live cash/overdue/stock, type{" "}
                    <span class="font-medium text-text-primary">@</span> to tag items/customers/serials/docs, or
                    attach a file for context.
                  </p>
                  <p class="text-xs font-medium uppercase tracking-wide text-text-secondary">Try asking</p>
                  <div class="flex flex-wrap gap-2">
                    <For each={suggestedPrompts(loc.pathname)}>
                      {(prompt) => (
                        <button
                          type="button"
                          class="rounded-full border border-stroke bg-white px-3 py-1 text-xs text-text-primary hover:border-brand-300 hover:bg-brand-50"
                          onClick={() => props.assistant.ask(prompt)}
                        >
                          {prompt}
                        </button>
                      )}
                    </For>
                    <button
                      type="button"
                      class="rounded-full border border-stroke bg-white px-3 py-1 text-xs text-text-primary hover:border-brand-300 hover:bg-brand-50"
                      onClick={() => {
                        const v = "generate quotation for @";
                        setDraft(v);
                        queueMicrotask(() => {
                          inputEl?.focus();
                          inputEl?.setSelectionRange(v.length, v.length);
                        });
                      }}
                    >
                      Generate quotation for @
                    </button>
                  </div>
                </div>
              }
            >
              <HelpChatThread
                messages={props.assistant.messages()}
                pathname={loc.pathname}
                onAsk={(text) => props.assistant.ask(text)}
                streamingText={props.assistant.streamingText()}
              />
            </Show>
          </div>

          <footer class="relative border-t border-stroke p-3">
            <Show when={mentionOpen()}>
              <div class="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-48 overflow-y-auto rounded-lg border border-stroke bg-white shadow-lg">
                <For each={mentionItems()}>
                  {(item, idx) => (
                    <button
                      type="button"
                      class={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-brand-50 ${
                        idx() === mentionIndex() ? "bg-brand-50" : ""
                      }`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(item);
                      }}
                    >
                      <span class="rounded bg-slate-100 px-1.5 py-0.5 font-medium uppercase text-text-secondary">
                        {item.type}
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium text-text-primary">{item.label}</span>
                        <Show when={item.code || item.extra}>
                          <span class="block truncate text-text-secondary">
                            {[item.code, item.extra].filter(Boolean).join(" · ")}
                          </span>
                        </Show>
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={pendingFiles().length || extractError()}>
              <div class="mb-2 space-y-1">
                <div class="flex flex-wrap gap-1.5">
                  <For each={pendingFiles()}>
                    {(f, idx) => (
                      <span class="inline-flex items-center gap-1 rounded-md border border-stroke bg-slate-50 px-2 py-1 text-[11px] text-text-primary">
                        {f.name}
                        <button
                          type="button"
                          class="text-text-secondary hover:text-red-600"
                          aria-label="Remove file"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx()))}
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </For>
                </div>
                <Show when={extractError()}>
                  <p class="text-[11px] text-red-600">{extractError()}</p>
                </Show>
              </div>
            </Show>
            <form
              class="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={fileInput}
                type="file"
                class="hidden"
                multiple
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                onChange={(e) => void onFiles(e.currentTarget.files)}
              />
              <button
                type="button"
                class="shrink-0 rounded-lg border border-stroke px-2.5 py-2 text-sm text-text-secondary hover:bg-slate-50 disabled:opacity-50"
                disabled={props.assistant.busy() || extracting()}
                title="Attach PDF, Word, spreadsheet, or image"
                onClick={() => fileInput?.click()}
              >
                {extracting() ? "…" : "+"}
              </button>
              <textarea
                ref={inputEl}
                rows={props.assistant.maximized() ? 3 : 2}
                class="min-w-0 flex-1 resize-none rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
                placeholder="Message Copilot… type @ to tag · Enter to send"
                value={draft()}
                disabled={props.assistant.busy()}
                onInput={(e) => {
                  const v = e.currentTarget.value;
                  setDraft(v);
                  scheduleMentionSearch(v, e.currentTarget.selectionStart ?? v.length);
                }}
                onKeyDown={(e) => {
                  if (mentionOpen()) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setMentionIndex((i) => Math.min(i + 1, Math.max(0, mentionItems().length - 1)));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setMentionIndex((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      const item = mentionItems()[mentionIndex()];
                      if (item) {
                        e.preventDefault();
                        insertMention(item);
                        return;
                      }
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="submit"
                class="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={props.assistant.busy() || extracting() || (!draft().trim() && !pendingFiles().length)}
              >
                Send
              </button>
            </form>
          </footer>
        </div>
      </section>
    </Show>
  );
}
