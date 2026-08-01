import { A, useLocation, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { HelpChatThread } from "./HelpChatThread";
import { useHelpAssistantUi } from "./helpAssistantContext";
import { useHelpAssistant } from "./useHelpAssistant";
import { COPILOT_WORKFLOW_GROUPS, COPILOT_WORKFLOW_TILES } from "./copilotWorkflows";

/**
 * Full-page Baiko workspace: same ask/approve/session state as the drawer.
 * Workflow tiles send canned queries — no LLM invents tools.
 */
export default function CopilotWorkspacePage() {
  const loc = useLocation();
  const ui = useHelpAssistantUi();
  // Prefer shared shell assistant; fall back so the page never dead-ends if context is late.
  const localAssistant = useHelpAssistant(() => loc.pathname);
  const assistant = () => ui?.assistant ?? localAssistant;
  const [searchParams, setSearchParams] = useSearchParams();
  const [draft, setDraft] = createSignal("");
  let scrollEl: HTMLDivElement | undefined;

  onMount(() => {
    const a = assistant();
    a.refreshAIConfig();
    void a.refreshSessions();
    a.setSessionsOpen(true);
    const sid = Number(searchParams.session);
    if (Number.isFinite(sid) && sid > 0) {
      void a.loadSession(sid);
    }
    const q = String(searchParams.q ?? "").trim();
    if (q) {
      setSearchParams({ q: undefined, session: searchParams.session });
      queueMicrotask(() => a.ask(q));
    }
  });

  createEffect(() => {
    assistant().messages();
    assistant().streamingText();
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  const submit = () => {
    const q = draft().trim();
    if (!q) return;
    assistant().ask(q);
    setDraft("");
  };

  return (
    <div class="flex h-[calc(100vh-3.5rem)] min-h-[28rem] flex-col bg-slate-50 md:flex-row">
      <aside class="flex w-full shrink-0 flex-col border-b border-stroke bg-white md:w-64 md:border-b-0 md:border-r">
        <div class="flex items-center justify-between gap-2 border-b border-stroke px-3 py-3">
          <div>
            <h1 class="text-sm font-semibold text-text-primary">Baiko</h1>
            <p class="text-[11px] text-text-secondary">Workspace</p>
          </div>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
            onClick={() => assistant().newChat()}
          >
            New chat
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-2">
          <p class="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-text-secondary">History</p>
          <For
            each={assistant().sessions()}
            fallback={<p class="px-2 py-2 text-xs text-text-secondary">No chats yet.</p>}
          >
            {(s) => (
              <button
                type="button"
                class="mb-0.5 w-full truncate rounded-md px-2 py-1.5 text-left text-xs text-text-primary hover:bg-slate-100"
                onClick={() => void assistant().loadSession(s.id)}
              >
                {s.title || "Untitled"}
              </button>
            )}
          </For>
        </div>
        <p class="border-t border-stroke px-3 py-2 text-[10px] leading-snug text-text-secondary">
          Live company data · Approve before any change · Not BIR filing advice
        </p>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col bg-white">
        <div ref={scrollEl} class="flex-1 overflow-y-auto px-4 py-4 md:px-8">
          <Show
            when={assistant().messages().length > 0}
            fallback={
              <div class="mx-auto max-w-3xl space-y-6">
                <div>
                  <h2 class="text-2xl font-semibold tracking-tight text-text-primary">Baiko</h2>
                  <p class="mt-1 text-sm text-text-secondary">
                    Ask questions, launch approve-to-act drafts, or open a work queue. Nothing posts money until you
                    Approve.
                  </p>
                </div>
                <For each={[...COPILOT_WORKFLOW_GROUPS]}>
                  {(group) => (
                    <section class="space-y-2">
                      <h3 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">{group}</h3>
                      <div class="grid gap-2 sm:grid-cols-2">
                        <For each={COPILOT_WORKFLOW_TILES.filter((t) => t.group === group)}>
                          {(tile) => (
                            <button
                              type="button"
                              class="rounded-xl border border-stroke bg-slate-50/80 px-3 py-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
                              onClick={() => assistant().ask(tile.query)}
                            >
                              <span class="block text-sm font-medium text-text-primary">{tile.label}</span>
                              <span class="mt-0.5 block text-xs text-text-secondary">{tile.hint}</span>
                            </button>
                          )}
                        </For>
                      </div>
                    </section>
                  )}
                </For>
                <p class="text-xs text-text-secondary">
                  Prefer the drawer on any screen? Press{" "}
                  <kbd class="rounded border border-stroke bg-slate-50 px-1">Ctrl</kbd>+
                  <kbd class="rounded border border-stroke bg-slate-50 px-1">Shift</kbd>+
                  <kbd class="rounded border border-stroke bg-slate-50 px-1">H</kbd>. Transaction errors use Smart Assist
                  toasts — not this page.
                </p>
              </div>
            }
          >
            <div class="mx-auto max-w-3xl">
              <HelpChatThread
                messages={assistant().messages()}
                  pathname="/app/baiko"
                onAsk={(text) => assistant().ask(text)}
                streamingText={assistant().streamingText()}
                busy={assistant().busy()}
              />
            </div>
          </Show>
        </div>

        <footer class="border-t border-stroke bg-white px-4 py-3 md:px-8">
          <form
            class="mx-auto flex max-w-3xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              rows={2}
              class="min-w-0 flex-1 resize-none rounded-xl border border-stroke px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Message Baiko… Enter to send"
              value={draft()}
              disabled={assistant().busy()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <button
              type="submit"
              class="shrink-0 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={assistant().busy() || !draft().trim()}
            >
              Send
            </button>
          </form>
          <p class="mx-auto mt-2 max-w-3xl text-[11px] text-text-secondary">
            <A href="/app/documentation" class="underline hover:text-text-primary">
              Help & guides
            </A>
            {" · "}
            Guides and live tools only — Baiko will not invent numbers.
          </p>
        </footer>
      </div>
    </div>
  );
}
