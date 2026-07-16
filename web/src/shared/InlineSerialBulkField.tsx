import { createEffect, createSignal, Show } from "solid-js";
import { inputClass } from "./SpreadsheetGrid";
import { dedupeSerials, formatSerialBulkList, parseSerialBulkInput } from "./serialBulkParse";

type Props = {
  /** Committed serial numbers for this line. */
  serials: string[];
  targetQty: number;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  /** When true, show read-only comma list (posted documents). */
  readOnly?: boolean;
  onCommit: (serials: string[]) => void | Promise<void>;
  /** Optional scan/pick modal. */
  onOpenAdvanced?: () => void;
};

export function InlineSerialBulkField(props: Props) {
  const [draft, setDraft] = createSignal("");
  const [localBusy, setLocalBusy] = createSignal(false);

  createEffect(() => {
    setDraft(formatSerialBulkList(props.serials));
  });

  const count = () => props.serials.length;
  const target = () => Math.max(1, Math.floor(props.targetQty));
  const mismatch = () => count() > 0 && count() !== target();
  const busy = () => props.busy || localBusy();

  const commitDraft = async (raw: string) => {
    const next = dedupeSerials(parseSerialBulkInput(raw));
    setLocalBusy(true);
    try {
      await props.onCommit(next);
    } finally {
      setLocalBusy(false);
    }
  };

  const appendToken = async (token: string) => {
    const sn = token.trim();
    if (!sn || props.disabled || props.readOnly) return;
    const existing = dedupeSerials([...props.serials, ...parseSerialBulkInput(sn)]);
    if (existing.length === props.serials.length) return;
    setLocalBusy(true);
    try {
      await props.onCommit(existing.slice(0, target()));
    } finally {
      setLocalBusy(false);
    }
    setDraft("");
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (props.disabled || props.readOnly) return;
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = draft().trim();
    if (!raw) return;
    if (raw.includes(",") || raw.includes("\n") || raw.includes(";")) {
      void commitDraft(raw);
      return;
    }
    void appendToken(raw);
  };

  const onBlur = () => {
    if (props.disabled || props.readOnly) return;
    const raw = draft().trim();
    const formatted = formatSerialBulkList(props.serials);
    if (raw === formatted) return;
    void commitDraft(raw);
  };

  const borderClass = () =>
    mismatch() ? "border-amber-400 bg-amber-50" : "border-stroke bg-white";

  return (
    <div class="min-w-[10rem] space-y-0.5">
      <div class="flex gap-1">
        <input
          class={`${inputClass} min-w-0 flex-1 font-mono text-xs ${borderClass()} ${props.readOnly ? "cursor-default bg-slate-50" : ""}`}
          value={draft()}
          disabled={props.disabled || busy()}
          readOnly={props.readOnly}
          placeholder={props.placeholder ?? "SN001, SN002, …"}
          title="Enter serials comma-separated. Each serial = 1 qty. Press Enter after each scan."
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        <Show when={props.onOpenAdvanced}>
          <button
            type="button"
            class="shrink-0 rounded border border-stroke px-1.5 py-1 text-xs text-text-secondary hover:bg-slate-50 disabled:opacity-50"
            disabled={props.disabled}
            title="Scan, paste, or pick serials"
            onClick={() => props.onOpenAdvanced?.()}
          >
            ⋯
          </button>
        </Show>
      </div>
      <p class={`text-[10px] tabular-nums ${mismatch() ? "text-amber-800" : "text-text-secondary"}`}>
        {count()} / {target()} serial{target() === 1 ? "" : "s"}
        {mismatch() ? " · qty should match serial count" : count() > 0 ? " · each serial = 1 unit" : ""}
        {busy() ? " · …" : ""}
      </p>
    </div>
  );
}
