import { Show, createEffect, createSignal, on, type JSX } from "solid-js";
import { safeAppPath } from "../help-assistant/safeAppPath";
import {
  extractCmsArticlePaste,
  htmlToMarkdown,
  looksLikeMarkdown,
  markdownToSafeHtml,
  parseYouTubeId,
  safeHttpsUrl,
  type CmsArticlePaste,
} from "./cmsMarkdownCodec";
import { safeArticlesPath } from "./cmsPermalink";

export type CmsBodyEditorProps = {
  markdown: string;
  onMarkdown: (md: string) => void;
  onPasteArticle?: (meta: CmsArticlePaste) => void;
  disabled?: boolean;
};

type Mode = "visual" | "markdown";

const btn =
  "rounded border border-stroke px-2 py-1 text-xs font-medium text-text-secondary hover:bg-slate-50 disabled:opacity-40";

export function CmsBodyEditor(props: CmsBodyEditorProps) {
  const [mode, setMode] = createSignal<Mode>("visual");
  let editor: HTMLDivElement | undefined;
  let lastExternal = "";

  const applyVisual = (md: string) => {
    if (!editor) return;
    const html = markdownToSafeHtml(md).trim();
    lastExternal = md;
    const next = html || "<p><br></p>";
    if (editor.innerHTML !== next) editor.innerHTML = next;
  };

  const insertHtml = (html: string) => {
    if (props.disabled) return;
    editor?.focus();
    document.execCommand("insertHTML", false, html);
    emitFromVisual();
  };

  const safeEditorHref = (raw: string): string | null => {
    const s = (raw || "").trim();
    if (!s || /^(javascript|data|vbscript):/i.test(s)) return null;
    if (s.startsWith("/app/")) return safeAppPath(s);
    if (s === "/articles" || s.startsWith("/articles/")) return safeArticlesPath(s);
    return safeHttpsUrl(s.startsWith("http://") ? s.replace(/^http:/, "https:") : s);
  };

  createEffect(
    on(
      () => props.markdown,
      (md) => {
        if (mode() !== "visual" || !editor) return;
        if (md === lastExternal) return;
        if (document.activeElement === editor) return;
        applyVisual(md);
      },
    ),
  );

  createEffect(
    on(mode, (m) => {
      if (m === "visual") applyVisual(props.markdown);
    }),
  );

  const emitFromVisual = () => {
    if (!editor) return;
    const md = htmlToMarkdown(editor.innerHTML);
    lastExternal = md;
    props.onMarkdown(md);
  };

  const run = (cmd: string, value?: string) => {
    if (props.disabled) return;
    editor?.focus();
    document.execCommand(cmd, false, value);
    emitFromVisual();
  };

  const applyPastedMarkdown = (raw: string, replaceAll: boolean) => {
    const parsed = extractCmsArticlePaste(raw);
    if (replaceAll) {
      props.onPasteArticle?.(parsed);
      props.onMarkdown(parsed.body);
      lastExternal = parsed.body;
      if (mode() === "visual") applyVisual(parsed.body);
      return;
    }
    if (mode() === "visual") {
      document.execCommand("insertHTML", false, markdownToSafeHtml(parsed.body));
      emitFromVisual();
      return;
    }
    const cur = props.markdown;
    const next = cur.trim() ? `${cur.trimEnd()}\n\n${parsed.body}` : parsed.body;
    lastExternal = next;
    props.onMarkdown(next);
  };

  const shouldReplaceAll = (text: string) => text.trimStart().startsWith("---") || !props.markdown.trim();

  const onVisualPaste: JSX.EventHandlerUnion<HTMLDivElement, ClipboardEvent> = (e) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (looksLikeMarkdown(text) || text.trimStart().startsWith("---")) {
      e.preventDefault();
      applyPastedMarkdown(text, shouldReplaceAll(text));
      return;
    }
    e.preventDefault();
    const html = e.clipboardData?.getData("text/html") ?? "";
    if (html && /<(p|h[1-6]|li|strong|b|em|i|ul|ol)\b/i.test(html)) {
      document.execCommand("insertHTML", false, markdownToSafeHtml(htmlToMarkdown(html)));
      emitFromVisual();
      return;
    }
    document.execCommand("insertText", false, text);
    emitFromVisual();
  };

  const tabCls = (m: Mode) =>
    `rounded-md px-3 py-1 text-sm ${mode() === m ? "bg-white font-medium text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`;

  return (
    <div class="overflow-hidden rounded-lg border border-stroke bg-white">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-stroke bg-slate-50 px-2 py-1.5">
        <div class="flex rounded-lg bg-slate-200/70 p-0.5" role="tablist" aria-label="Editor mode">
          <button type="button" class={tabCls("visual")} onClick={() => setMode("visual")}>
            Visual
          </button>
          <button type="button" class={tabCls("markdown")} onClick={() => setMode("markdown")}>
            Markdown
          </button>
        </div>
        <p class="text-[11px] text-text-secondary">Paste a generated .md file, or use Image URL / YouTube on the toolbar.</p>
      </div>
      <Show when={mode() === "visual"} fallback={
        <textarea
          class="min-h-[320px] w-full resize-y border-0 bg-white px-3 py-3 font-mono text-sm leading-relaxed outline-none"
          value={props.markdown}
          disabled={props.disabled}
          spellcheck={true}
          onInput={(e) => {
            const v = e.currentTarget.value;
            lastExternal = v;
            props.onMarkdown(v);
          }}
          onPaste={(e) => {
            const text = e.clipboardData?.getData("text/plain") ?? "";
            if (!looksLikeMarkdown(text) && !text.trimStart().startsWith("---")) return;
            e.preventDefault();
            applyPastedMarkdown(text, shouldReplaceAll(text));
          }}
        />
      }>
        <>
          <div class="flex flex-wrap gap-1 border-b border-stroke bg-slate-50 px-2 py-1.5" role="toolbar" aria-label="Formatting">
            <button type="button" class={btn} disabled={props.disabled} title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => run("bold")}>
              <strong>B</strong>
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => run("italic")}>
              <em>I</em>
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Heading" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "h2")}>
              H2
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Subheading" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "h3")}>
              H3
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Quote" onMouseDown={(e) => e.preventDefault()} onClick={() => run("formatBlock", "blockquote")}>
              Quote
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Bulleted list" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertUnorderedList")}>
              • List
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Numbered list" onMouseDown={(e) => e.preventDefault()} onClick={() => run("insertOrderedList")}>
              1. List
            </button>
            <button
              type="button"
              class={btn}
              disabled={props.disabled}
              title="Insert link"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const url = window.prompt("Link URL (/articles/…, /app/…, or https://)");
                if (!url) return;
                const safe = safeEditorHref(url);
                if (!safe) return;
                run("createLink", safe);
              }}
            >
              Link
            </button>
            <button
              type="button"
              class={btn}
              disabled={props.disabled}
              title="Image from URL"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const url = window.prompt("Image URL (https://…)");
                if (!url) return;
                const safe = safeHttpsUrl(url.startsWith("http://") ? url.replace(/^http:/, "https:") : url);
                if (!safe) return;
                const alt = window.prompt("Alt text") ?? "";
                const a = alt.replace(/"/g, "");
                insertHtml(`<img class="cms-url-img" src="${safe.replace(/"/g, "")}" alt="${a}" />`);
              }}
            >
              Image URL
            </button>
            <button
              type="button"
              class={btn}
              disabled={props.disabled}
              title="YouTube video"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const url = window.prompt("YouTube URL");
                if (!url) return;
                const id = parseYouTubeId(url.trim().replace(/^http:\/\//i, "https://"));
                if (!id) return;
                insertHtml(`<div class="cms-yt-chip" contenteditable="false" data-cms-youtube="${id}">[YouTube]</div>`);
              }}
            >
              YouTube
            </button>
            <button type="button" class={btn} disabled={props.disabled} title="Remove formatting" onMouseDown={(e) => e.preventDefault()} onClick={() => run("removeFormat")}>
              Clear
            </button>
          </div>
          <div class="relative">
            <div
              ref={(el) => {
                editor = el;
                applyVisual(props.markdown);
              }}
              class="cms-rte relative z-[1] min-h-[320px] max-w-none px-3 py-3 text-sm leading-relaxed text-text-primary outline-none"
              contentEditable={!props.disabled}
              role="textbox"
              aria-multiline="true"
              aria-label="Page body"
              data-placeholder="Write like WordPress, or paste a markdown article…"
              onInput={() => emitFromVisual()}
              onBlur={() => emitFromVisual()}
              onPaste={onVisualPaste}
            />
            <style>{`
              .cms-rte {
                user-select: text;
                -webkit-user-select: text;
                cursor: text;
              }
              .cms-rte[contenteditable="false"] { cursor: not-allowed; opacity: 0.7; }
              .cms-rte:empty:before {
                content: attr(data-placeholder);
                color: var(--color-text-secondary, #64748b);
                pointer-events: none;
                position: absolute;
                left: 0.75rem;
                top: 0.75rem;
              }
              .cms-rte h2 { font-size: 1.125rem; font-weight: 600; margin: 1em 0 0.4em; }
              .cms-rte h3 { font-size: 1rem; font-weight: 600; margin: 0.9em 0 0.35em; }
              .cms-rte p { margin: 0 0 0.75em; }
              .cms-rte ul, .cms-rte ol { margin: 0 0 0.75em; padding-left: 1.35rem; }
              .cms-rte li { margin: 0.15em 0; }
              .cms-rte blockquote {
                margin: 0 0 0.75em;
                padding-left: 0.75rem;
                border-left: 3px solid #cbd5e1;
                color: #475569;
              }
              .cms-rte a { color: #2563eb; text-decoration: underline; }
              .cms-rte img.cms-url-img, .cms-rte img {
                display: block;
                max-height: 16rem;
                max-width: 100%;
                margin: 0.5rem 0;
                border-radius: 0.5rem;
                border: 1px solid #e2e8f0;
              }
              .cms-rte .cms-media-chip, .cms-rte .cms-yt-chip {
                display: inline-block;
                padding: 0.15rem 0.5rem;
                border-radius: 0.25rem;
                background: #f1f5f9;
                font-size: 0.75rem;
                color: #475569;
              }
              .cms-rte .cms-yt-chip { background: #0f172a; color: #e2e8f0; }
              .cms-rte p:last-child { margin-bottom: 0; }
            `}</style>
          </div>
        </>
      </Show>
    </div>
  );
}
