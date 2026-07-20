import { createEffect, onCleanup, type JSX } from "solid-js";

export type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  class?: string;
};

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

/** Lightweight contenteditable editor (Gmail-like toolbar, no extra deps). */
export function RichTextEditor(props: RichTextEditorProps) {
  let editor!: HTMLDivElement;
  let syncing = false;

  createEffect(() => {
    const next = props.value ?? "";
    if (!editor) return;
    if (syncing) return;
    if (editor.innerHTML !== next) {
      editor.innerHTML = next || "";
    }
  });

  const emit = () => {
    syncing = true;
    props.onChange(editor.innerHTML);
    queueMicrotask(() => {
      syncing = false;
    });
  };

  const onPaste: JSX.EventHandlerUnion<HTMLDivElement, ClipboardEvent> = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
    emit();
  };

  onCleanup(() => {
    /* no-op */
  });

  const btn =
    "rounded border border-stroke px-2 py-1 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-40";

  return (
    <div class={`overflow-hidden rounded-lg border border-stroke bg-white ${props.class ?? ""}`}>
      <div class="flex flex-wrap gap-1 border-b border-stroke bg-slate-50 px-2 py-1.5">
        <button type="button" class={btn} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("bold"); emit(); }}>
          <strong>B</strong>
        </button>
        <button type="button" class={btn} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("italic"); emit(); }}>
          <em>I</em>
        </button>
        <button type="button" class={btn} title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("underline"); emit(); }}>
          <span class="underline">U</span>
        </button>
        <button type="button" class={btn} title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("insertUnorderedList"); emit(); }}>
          • List
        </button>
        <button type="button" class={btn} title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("insertOrderedList"); emit(); }}>
          1. List
        </button>
        <button
          type="button"
          class={btn}
          title="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) {
              exec("createLink", url);
              emit();
            }
          }}
        >
          Link
        </button>
        <button type="button" class={btn} title="Remove formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => { exec("removeFormat"); emit(); }}>
          Clear
        </button>
      </div>
      <div
        ref={editor}
        class={`email-rte max-w-none px-3 py-2 text-sm text-text-primary outline-none empty:before:pointer-events-none empty:before:text-text-secondary empty:before:content-[attr(data-placeholder)] ${props.minHeightClass ?? "min-h-[140px]"}`}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={props.placeholder ?? "Write your message…"}
        onInput={() => emit()}
        onBlur={() => emit()}
        onPaste={onPaste}
      />
    </div>
  );
}
