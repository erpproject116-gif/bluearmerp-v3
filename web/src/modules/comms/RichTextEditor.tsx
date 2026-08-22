import { createEffect, on, type JSX } from "solid-js";

export type PasteImageResult = {
  src: string;
  alt?: string;
  /** Extra attributes on the img (e.g. data-ticket-attachment-id). */
  attrs?: Record<string, string>;
};

export type RichTextEditorProps = {
  /** External HTML to load (set when opening compose / loading signature). Not reapplied while typing. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeightClass?: string;
  class?: string;
  /**
   * When set, image files on paste are uploaded/handled by the parent.
   * Return insert info, or null to skip that file.
   */
  onPasteImage?: (file: File) => Promise<PasteImageResult | null>;
};

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Lightweight contenteditable editor (Gmail-like toolbar, no extra deps). */
export function RichTextEditor(props: RichTextEditorProps) {
  let editor: HTMLDivElement | undefined;
  let lastExternal = "";

  // Apply external value only when it changes from outside (open modal / reset), not on every keystroke.
  createEffect(
    on(
      () => props.value,
      (next) => {
        const html = next ?? "";
        if (!editor) return;
        if (html === lastExternal && editor.innerHTML === html) return;
        // Avoid clobbering caret while the user is editing this node.
        if (document.activeElement === editor && html === lastExternal) return;
        lastExternal = html;
        if (editor.innerHTML !== html) {
          editor.innerHTML = html;
        }
      },
    ),
  );

  const emit = () => {
    if (!editor) return;
    const html = editor.innerHTML;
    lastExternal = html;
    props.onChange(html);
  };

  const run = (cmd: string, value?: string) => {
    editor?.focus();
    document.execCommand(cmd, false, value);
    emit();
  };

  const insertImage = (result: PasteImageResult) => {
    editor?.focus();
    const alt = result.alt ?? "image";
    const extra = Object.entries(result.attrs ?? {})
      .map(([k, v]) => `${k}="${escapeAttr(v)}"`)
      .join(" ");
    const html = `<img src="${escapeAttr(result.src)}" alt="${escapeAttr(alt)}" ${extra} style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;" />`;
    document.execCommand("insertHTML", false, html);
  };

  const clipboardImageFiles = (data: DataTransfer | null): File[] => {
    if (!data) return [];
    const out: File[] = [];
    const items = data.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) out.push(f);
        }
      }
    }
    if (out.length === 0 && data.files?.length) {
      for (let i = 0; i < data.files.length; i++) {
        const f = data.files[i];
        if (f.type.startsWith("image/")) out.push(f);
      }
    }
    return out;
  };

  const onPaste: JSX.EventHandlerUnion<HTMLDivElement, ClipboardEvent> = (e) => {
    const images = props.onPasteImage ? clipboardImageFiles(e.clipboardData) : [];
    if (images.length > 0 && props.onPasteImage) {
      e.preventDefault();
      const handler = props.onPasteImage;
      void (async () => {
        for (const file of images) {
          const result = await handler(file);
          if (result) insertImage(result);
        }
        emit();
      })();
      return;
    }
    e.preventDefault();
    const text = e.clipboardData?.getData("text/plain") ?? "";
    document.execCommand("insertText", false, text);
    emit();
  };

  const btn =
    "rounded border border-stroke px-2 py-1 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-40";

  return (
    <div class={`overflow-hidden rounded-lg border border-stroke bg-white ${props.class ?? ""}`}>
      <div class="flex flex-wrap gap-1 border-b border-stroke bg-slate-50 px-2 py-1.5" role="toolbar" aria-label="Formatting">
        <button type="button" class={btn} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}>
          <strong>B</strong>
        </button>
        <button type="button" class={btn} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}>
          <em>I</em>
        </button>
        <button type="button" class={btn} title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => run("underline")}>
          <span class="underline">U</span>
        </button>
        <button
          type="button"
          class={btn}
          title="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("insertUnorderedList")}
        >
          • List
        </button>
        <button
          type="button"
          class={btn}
          title="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("insertOrderedList")}
        >
          1. List
        </button>
        <button
          type="button"
          class={btn}
          title="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) run("createLink", url);
          }}
        >
          Link
        </button>
        <button
          type="button"
          class={btn}
          title="Remove formatting"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => run("removeFormat")}
        >
          Clear
        </button>
      </div>
      <div class="relative">
        <div
          ref={(el) => {
            editor = el;
            // Seed once when the node mounts.
            const html = props.value ?? "";
            lastExternal = html;
            if (html && el.innerHTML !== html) el.innerHTML = html;
          }}
          class={`email-rte relative z-[1] max-w-none px-3 py-2 text-sm text-text-primary outline-none ${props.minHeightClass ?? "min-h-[140px]"}`}
          contentEditable={true}
          role="textbox"
          aria-multiline="true"
          aria-label={props.placeholder ?? "Message"}
          data-placeholder={props.placeholder ?? "Write your message…"}
          onInput={() => emit()}
          onBlur={() => emit()}
          onPaste={onPaste}
        />
        <style>{`
          .email-rte:empty:before {
            content: attr(data-placeholder);
            color: var(--color-text-secondary, #64748b);
            pointer-events: none;
            position: absolute;
            left: 0.75rem;
            top: 0.5rem;
          }
          .email-rte p { margin: 0 0 0.75em; }
          .email-rte ul, .email-rte ol { margin: 0 0 0.75em; padding-left: 1.25rem; }
          .email-rte li { margin: 0.15em 0; }
          .email-rte p:last-child { margin-bottom: 0; }
          .email-rte img { max-width: 100%; height: auto; border-radius: 6px; margin: 8px 0; }
        `}</style>
      </div>
    </div>
  );
}
