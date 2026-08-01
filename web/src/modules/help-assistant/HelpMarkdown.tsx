import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { safeAppPath } from "./safeAppPath";

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "h"; level: 2 | 3; text: string }
  | { type: "code"; text: string };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/\[([^\]]+)\]\((\/app\/[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_m, label, href) => {
    const h = String(href);
    if (h.startsWith("/app/")) {
      const safe = safeAppPath(h);
      if (!safe) {
        return label;
      }
      return `<a href="${escapeHtml(safe)}" data-help-link="1" class="text-brand-600 underline underline-offset-2 hover:text-brand-700">${label}</a>`;
    }
    // External https? — keep noopener; scheme already constrained by regex (no javascript:/data:)
    return `<a href="${escapeHtml(h)}" target="_blank" rel="noopener noreferrer" class="text-brand-600 underline underline-offset-2 hover:text-brand-700" title="Opens outside Bluearm">${label}</a><span class="ml-1 text-[10px] text-text-secondary">(opens outside Bluearm)</span>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-[0.85em]">$1</code>');
  return s;
}

export function parseHelpMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (/^###\s+/.test(line)) {
      blocks.push({ type: "h", level: 3, text: line.replace(/^###\s+/, "") });
      i += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push({ type: "h", level: 2, text: line.replace(/^##\s+/, "") });
      i += 1;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? "")) {
        items.push((lines[i] ?? "").replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    const para: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !/^\s*[-*]\s+/.test(lines[i] ?? "") &&
      !/^\s*\d+\.\s+/.test(lines[i] ?? "") &&
      !/^##/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").startsWith("```")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}

/** True when markdown contains an external http(s) link (for UI note). */
export function helpMarkdownHasExternalLink(md: string): boolean {
  const re = /\[[^\]]+\]\((https?:\/\/[^)\s]+)\)/g;
  return re.test(md || "");
}

function BlockView(props: { block: Block }) {
  const b = () => props.block;
  if (b().type === "p") {
    return <p class="m-0" innerHTML={inlineMarkdown((b() as Extract<Block, { type: "p" }>).text)} />;
  }
  if (b().type === "ul") {
    return (
      <ul class="m-0 list-disc space-y-1 pl-5">
        <For each={(b() as Extract<Block, { type: "ul" }>).items}>
          {(item) => <li innerHTML={inlineMarkdown(item)} />}
        </For>
      </ul>
    );
  }
  if (b().type === "ol") {
    return (
      <ol class="m-0 list-decimal space-y-1 pl-5">
        <For each={(b() as Extract<Block, { type: "ol" }>).items}>
          {(item) => <li innerHTML={inlineMarkdown(item)} />}
        </For>
      </ol>
    );
  }
  if (b().type === "h") {
    const h = b() as Extract<Block, { type: "h" }>;
    if (h.level === 2) {
      return <h3 class="m-0 text-sm font-semibold" innerHTML={inlineMarkdown(h.text)} />;
    }
    return <h4 class="m-0 text-sm font-medium" innerHTML={inlineMarkdown(h.text)} />;
  }
  return (
    <pre class="m-0 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs">
      {(b() as Extract<Block, { type: "code" }>).text}
    </pre>
  );
}

/** Safe, dependency-free markdown for Baiko replies. */
export function HelpMarkdown(props: { content: string; class?: string; hideExternalNote?: boolean }) {
  return (
    <div class={`help-md space-y-2.5 text-sm leading-relaxed text-text-primary ${props.class ?? ""}`}>
      <For each={parseHelpMarkdown(props.content || "")}>{(block) => <BlockView block={block} />}</For>
      <Show when={!props.hideExternalNote && helpMarkdownHasExternalLink(props.content || "")}>
        <p class="m-0 text-[11px] text-text-secondary">Links marked “opens outside Bluearm” leave this app.</p>
      </Show>
    </div>
  );
}

export function HelpDeepLinkChips(props: { links: Array<{ label: string; href: string }> }) {
  const safeLinks = () =>
    (props.links || [])
      .map((link) => {
        const href = safeAppPath(link.href);
        return href ? { label: link.label, href } : null;
      })
      .filter((x): x is { label: string; href: string } => x != null);

  return (
    <div class="flex flex-wrap gap-2 pt-1">
      <For each={safeLinks()}>
        {(link) => (
          <A
            href={link.href}
            class="inline-flex items-center rounded-md border border-stroke bg-slate-50 px-2.5 py-1 text-xs font-medium text-brand-700 hover:border-brand-300 hover:bg-brand-50"
          >
            {link.label}
          </A>
        )}
      </For>
    </div>
  );
}
