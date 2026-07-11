import { useLocation } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { HelpChatThread } from "./HelpChatThread";
import { suggestedPrompts } from "./helpRouteContext";
import type { useHelpAssistant } from "./useHelpAssistant";

type Assistant = ReturnType<typeof useHelpAssistant>;

const PANEL_WIDTH = "min(24rem, calc(100vw - 2rem))";

export function HelpAssistantPanel(props: {
  open: boolean;
  onClose: () => void;
  assistant: Assistant;
}) {
  const loc = useLocation();
  const [draft, setDraft] = createSignal("");
  let scrollEl: HTMLDivElement | undefined;
  let inputEl: HTMLInputElement | undefined;

  createEffect(() => {
    if (props.open) {
      queueMicrotask(() => inputEl?.focus());
    }
  });

  createEffect(() => {
    props.assistant.messages();
    queueMicrotask(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    });
  });

  const submit = () => {
    const q = draft().trim();
    if (!q) return;
    props.assistant.ask(q);
    setDraft("");
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      props.onClose();
    }
  };

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-[60] bg-slate-900/30 sm:bg-transparent"
        role="presentation"
        onClick={props.onClose}
      />
      <section
        class="erp-surface fixed z-[61] flex flex-col overflow-hidden border border-stroke shadow-2xl"
        style={{
          width: PANEL_WIDTH,
          right: "1rem",
          bottom: "5.25rem",
          "max-height": "min(32rem, calc(100vh - 7rem))",
        }}
        aria-label="Bluearm help assistant"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <header class="flex items-center justify-between border-b border-stroke px-4 py-3">
          <div>
            <h2 class="text-sm font-semibold text-text-primary">Help assistant</h2>
            <p class="text-xs text-text-secondary">Search guides & knowledge base</p>
          </div>
          <div class="flex items-center gap-1">
            <Show when={props.assistant.messages().length > 0}>
              <button
                type="button"
                class="rounded px-2 py-1 text-xs text-text-secondary hover:bg-slate-100"
                onClick={() => props.assistant.clear()}
              >
                Clear
              </button>
            </Show>
            <button
              type="button"
              class="rounded p-1 text-text-secondary hover:bg-slate-100 hover:text-text-primary"
              aria-label="Close help"
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
                <p>Ask how to use Bluearm ERP. Answers come from in-app documentation.</p>
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
                </div>
              </div>
            }
          >
            <HelpChatThread messages={props.assistant.messages()} />
          </Show>
        </div>

        <footer class="border-t border-stroke p-3">
          <form
            class="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              ref={inputEl}
              type="search"
              class="min-w-0 flex-1 rounded-lg border border-stroke px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              placeholder="Ask a question…"
              value={draft()}
              disabled={props.assistant.busy()}
              onInput={(e) => setDraft(e.currentTarget.value)}
            />
            <button
              type="submit"
              class="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={props.assistant.busy() || !draft().trim()}
            >
              Ask
            </button>
          </form>
        </footer>
      </section>
    </Show>
  );
}
