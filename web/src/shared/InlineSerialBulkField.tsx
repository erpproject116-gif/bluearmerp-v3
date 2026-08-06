import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { dedupeSerials, parseSerialBulkInput } from "./serialBulkParse";

/** Pause after last keystroke before auto-accepting a scanned serial (gun usually finishes in &lt;50ms). */
const SCAN_AUTO_COMMIT_MS = 180;

type Props = {
  /** Committed serial numbers for this line. */
  serials: string[];
  targetQty: number;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  /** When true, show read-only list (posted documents). */
  readOnly?: boolean;
  /**
   * scan-next: input clears after each accept; list shows below.
   * bulk-edit: keep full list in the field (planned / sales bulk).
   */
  entryMode?: "scan-next" | "bulk-edit";
  /**
   * When true (default in scan-next), accept the serial after a short pause — no Enter needed.
   * Enter / blur still work for typing.
   */
  autoCommitScan?: boolean;
  onCommit: (serials: string[]) => void | Promise<void>;
  /** Optional scan/pick modal. */
  onOpenAdvanced?: () => void;
};

function formatBulkEdit(serials: string[]): string {
  return serials.join("\n");
}

export function InlineSerialBulkField(props: Props) {
  const entryMode = () => props.entryMode ?? "bulk-edit";
  const autoCommit = () => props.autoCommitScan !== false && entryMode() === "scan-next";
  const [draft, setDraft] = createSignal("");
  const [localBusy, setLocalBusy] = createSignal(false);

  let autoCommitTimer: ReturnType<typeof setTimeout> | undefined;

  const clearAutoCommit = () => {
    if (autoCommitTimer != null) {
      clearTimeout(autoCommitTimer);
      autoCommitTimer = undefined;
    }
  };

  onCleanup(() => clearAutoCommit());

  createEffect(() => {
    if (entryMode() === "bulk-edit") {
      setDraft(formatBulkEdit(props.serials));
    }
  });

  const count = () => props.serials.length;
  const target = () => Math.max(1, Math.floor(props.targetQty));
  const mismatch = () => count() > 0 && count() !== target();
  const busy = () => props.busy || localBusy();
  const remaining = () => Math.max(0, target() - count());

  const commitDraft = async (raw: string) => {
    const next = dedupeSerials(parseSerialBulkInput(raw));
    setLocalBusy(true);
    try {
      await props.onCommit(next);
    } finally {
      setLocalBusy(false);
    }
  };

  let queuedTokens: string[] = [];

  const drainQueue = async () => {
    while (queuedTokens.length > 0) {
      const batch = queuedTokens.splice(0, queuedTokens.length);
      const merged = dedupeSerials([...props.serials, ...batch.flatMap((t) => parseSerialBulkInput(t))]);
      if (merged.length === props.serials.length) continue;
      await props.onCommit(merged.slice(0, target()));
    }
  };

  const appendToken = (token: string) => {
    const sn = token.trim();
    if (!sn || props.disabled || props.readOnly) return;
    clearAutoCommit();
    setDraft("");
    queuedTokens.push(sn);
    if (localBusy()) return;
    setLocalBusy(true);
    void (async () => {
      try {
        await drainQueue();
      } finally {
        setLocalBusy(false);
      }
    })();
  };

  const scheduleAutoCommit = (raw: string) => {
    clearAutoCommit();
    if (!autoCommit() || props.disabled || props.readOnly) return;
    const value = raw.trim();
    if (!value) return;
    autoCommitTimer = setTimeout(() => {
      autoCommitTimer = undefined;
      const latest = draft().trim();
      if (!latest || props.disabled || props.readOnly) return;
      if (latest.includes(",") || latest.includes("\n") || latest.includes(";") || latest.includes("\t")) {
        void (async () => {
          await commitDraft(latest);
          setDraft("");
        })();
        return;
      }
      appendToken(latest);
    }, SCAN_AUTO_COMMIT_MS);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (props.disabled || props.readOnly) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearAutoCommit();
    const raw = draft().trim();
    if (!raw) return;
    if (raw.includes(",") || raw.includes("\n") || raw.includes(";") || raw.includes("\t")) {
      void (async () => {
        await commitDraft(raw);
        if (entryMode() === "scan-next") setDraft("");
      })();
      return;
    }
    appendToken(raw);
  };

  const onBlur = () => {
    if (props.disabled || props.readOnly) return;
    clearAutoCommit();
    if (entryMode() === "scan-next") {
      const raw = draft().trim();
      if (!raw) return;
      if (raw.includes(",") || raw.includes("\n") || raw.includes(";")) {
        void (async () => {
          await commitDraft(raw);
          setDraft("");
        })();
      } else {
        appendToken(raw);
      }
      return;
    }
    const raw = draft().trim();
    const formatted = formatBulkEdit(props.serials);
    if (raw === formatted) return;
    void commitDraft(raw);
  };

  const borderClass = () =>
    mismatch() && entryMode() === "bulk-edit" ? "border-amber-400 bg-amber-50" : "border-stroke bg-white";

  return (
    <div class="min-w-[10rem] space-y-1">
      <div class="flex gap-1">
        <Show
          when={entryMode() === "scan-next" && !props.readOnly}
          fallback={
            <textarea
              class={`${inputClass} min-h-[4.5rem] min-w-0 flex-1 resize-y font-mono text-xs ${borderClass()} ${props.readOnly ? "cursor-default bg-slate-50" : ""}`}
              value={draft()}
              disabled={props.disabled}
              readOnly={props.readOnly}
              placeholder={props.placeholder ?? "One serial per line\nSN001\nSN002"}
              title="One serial per line (or paste a list). Ctrl+Enter to apply."
              onInput={(e) => setDraft(e.currentTarget.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void commitDraft(draft());
                }
              }}
              onBlur={onBlur}
              rows={3}
            />
          }
        >
          <input
            class={`${inputClass} min-w-0 flex-1 font-mono text-xs ${borderClass()}`}
            value={draft()}
            disabled={props.disabled}
            placeholder={props.placeholder ?? "Scan serial — adds automatically"}
            title="Point the scanner here. Serial is added after a short pause (or press Enter). Field clears for the next unit."
            onInput={(e) => {
              const v = e.currentTarget.value;
              setDraft(v);
              scheduleAutoCommit(v);
            }}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
          />
        </Show>
        <Show when={props.onOpenAdvanced}>
          <button
            type="button"
            class="shrink-0 self-start rounded border border-stroke px-1.5 py-1 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled}
            title="Scan, paste, or manage serials"
            onClick={() => props.onOpenAdvanced?.()}
          >
            ⋯
          </button>
        </Show>
      </div>

      <Show when={entryMode() === "scan-next" && props.serials.length > 0}>
        <ul class="max-h-24 overflow-y-auto rounded border border-stroke/70 bg-slate-50 px-2 py-1 font-mono text-[10px] text-text-secondary">
          <For each={props.serials}>{(sn, i) => <li>{i() + 1}. {sn}</li>}</For>
        </ul>
      </Show>

      <p class={`text-[10px] tabular-nums ${mismatch() ? "text-amber-800" : "text-text-secondary"}`}>
        {count()} / {target()} serial{target() === 1 ? "" : "s"}
        {entryMode() === "scan-next" && remaining() > 0 ? ` · ${remaining()} left (partial OK)` : ""}
        {entryMode() === "scan-next" && remaining() === 0 && count() > 0 ? " · line full for this PO open qty" : ""}
        {entryMode() === "bulk-edit" && mismatch() ? " · count should match qty" : ""}
        {busy() ? " · …" : ""}
      </p>
    </div>
  );
}
