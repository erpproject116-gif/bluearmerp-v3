import { For, Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { parseHelpMarkdown, helpMarkdownHasExternalLink } from "../help-assistant/HelpMarkdown";
import { safeAppPath } from "../help-assistant/safeAppPath";
import { fetchCmsMediaObjectUrl } from "../../shared/cmsMedia";

const mediaToken = /!\[([^\]]*)\]\(cms-media:(\d+)\)/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(raw: string, mediaUrls: Record<number, string>): string {
  let s = escapeHtml(raw);
  s = s.replace(/!\[([^\]]*)\]\(cms-media:(\d+)\)/g, (_m, alt, idStr) => {
    const id = Number(idStr);
    const src = mediaUrls[id];
    const a = escapeHtml(String(alt ?? ""));
    if (!src) {
      return `<span class="text-text-secondary">[${a || "image"}]</span>`;
    }
    return `<img src="${src}" alt="${a}" class="max-h-64 max-w-full rounded-lg border border-stroke" />`;
  });
  s = s.replace(/\[([^\]]+)\]\((\/app\/[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_m, label, href) => {
    const h = String(href);
    if (h.startsWith("/app/")) {
      const safe = safeAppPath(h);
      if (!safe) return label;
      return `<a href="${escapeHtml(safe)}" class="text-brand-600 underline underline-offset-2 hover:text-brand-700">${label}</a>`;
    }
    return `<a href="${escapeHtml(h)}" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline underline-offset-2 hover:text-brand-700">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">$1</code>');
  return s;
}

function collectMediaIds(md: string): number[] {
  const ids = new Set<number>();
  const re = new RegExp(mediaToken.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(md || "")) !== null) {
    const id = Number(m[2]);
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return [...ids];
}

export function insertCmsMediaToken(body: string, id: number, alt: string): string {
  const token = `![${alt || "image"}](cms-media:${id})`;
  if (!body.trim()) return token;
  return `${body.trimEnd()}\n\n${token}\n`;
}

export function CmsMarkdown(props: { content: string; class?: string }) {
  const [urls, setUrls] = createSignal<Record<number, string>>({});
  const ids = createMemo(() => collectMediaIds(props.content || ""));

  createEffect(() => {
    const wanted = ids();
    let cancelled = false;
    const created: string[] = [];
    void (async () => {
      const next: Record<number, string> = {};
      for (const id of wanted) {
        const url = await fetchCmsMediaObjectUrl(id);
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        if (url) {
          created.push(url);
          next[id] = url;
        }
      }
      if (!cancelled) setUrls(next);
    })();
    onCleanup(() => {
      cancelled = true;
      for (const u of created) URL.revokeObjectURL(u);
    });
  });

  return (
    <div class={`cms-md space-y-2.5 text-sm leading-relaxed text-text-primary ${props.class ?? ""}`}>
      <For each={parseHelpMarkdown(props.content || "")}>
        {(block) => {
          if (block.type === "p") {
            return <p class="m-0" innerHTML={inlineMarkdown(block.text, urls())} />;
          }
          if (block.type === "ul") {
            return (
              <ul class="m-0 list-disc space-y-1 pl-5">
                <For each={block.items}>{(item) => <li innerHTML={inlineMarkdown(item, urls())} />}</For>
              </ul>
            );
          }
          if (block.type === "ol") {
            return (
              <ol class="m-0 list-decimal space-y-1 pl-5">
                <For each={block.items}>{(item) => <li innerHTML={inlineMarkdown(item, urls())} />}</For>
              </ol>
            );
          }
          if (block.type === "h") {
            const cls = block.level === 2 ? "m-0 text-base font-semibold" : "m-0 text-sm font-medium";
            return <h3 class={cls} innerHTML={inlineMarkdown(block.text, urls())} />;
          }
          return (
            <pre class="m-0 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">{block.text}</pre>
          );
        }}
      </For>
      <Show when={helpMarkdownHasExternalLink(props.content || "")}>
        <p class="m-0 text-[11px] text-text-secondary">Links marked outside Bluearm leave this app.</p>
      </Show>
    </div>
  );
}
