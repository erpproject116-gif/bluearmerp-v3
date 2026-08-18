/** Markdown codec for the Pages editor: storage stays markdown; Visual mode is HTML round-trip. */

export type CmsMdBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "h"; level: 2 | 3; text: string }
  | { type: "quote"; text: string }
  | { type: "code"; text: string };

export type CmsArticlePaste = {
  body: string;
  title?: string;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
};

const WRAP = 88;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function inlineMarkdownToHtml(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/!\[([^\]]*)\]\(cms-media:(\d+)\)/g, (_m, alt, id) => {
    const a = escapeHtml(String(alt ?? ""));
    return `<span class="cms-media-chip" contenteditable="false" data-cms-media="${id}" data-alt="${a}">[image: ${a || id}]</span>`;
  });
  s = s.replace(/\[([^\]]+)\]\((\/app\/[^)\s]+|https?:\/\/[^)\s]+)\)/g, (_m, label, href) => {
    return `<a href="${escapeHtml(String(href))}">${label}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  return s;
}

export function parseCmsMarkdown(md: string): CmsMdBlock[] {
  const lines = (md || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: CmsMdBlock[] = [];
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
      blocks.push({ type: "h", level: 3, text: line.replace(/^###\s+/, "").trim() });
      i += 1;
      continue;
    }
    if (/^##\s+/.test(line)) {
      blocks.push({ type: "h", level: 2, text: line.replace(/^##\s+/, "").trim() });
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? "")) {
        quoted.push((lines[i] ?? "").replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quoted.join(" ").trim() });
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
      !/^>\s?/.test(lines[i] ?? "") &&
      !(lines[i] ?? "").startsWith("```")
    ) {
      para.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ").replace(/\s+/g, " ").trim() });
  }
  return blocks;
}

export function markdownToSafeHtml(md: string): string {
  const parts: string[] = [];
  for (const block of parseCmsMarkdown(md)) {
    if (block.type === "p") {
      parts.push(`<p>${inlineMarkdownToHtml(block.text)}</p>`);
    } else if (block.type === "h") {
      const tag = block.level === 2 ? "h2" : "h3";
      parts.push(`<${tag}>${inlineMarkdownToHtml(block.text)}</${tag}>`);
    } else if (block.type === "ul") {
      parts.push(`<ul>${block.items.map((it) => `<li>${inlineMarkdownToHtml(it)}</li>`).join("")}</ul>`);
    } else if (block.type === "ol") {
      parts.push(`<ol>${block.items.map((it) => `<li>${inlineMarkdownToHtml(it)}</li>`).join("")}</ol>`);
    } else if (block.type === "quote") {
      parts.push(`<blockquote><p>${inlineMarkdownToHtml(block.text)}</p></blockquote>`);
    } else {
      parts.push(`<pre>${escapeHtml(block.text)}</pre>`);
    }
  }
  return parts.join("");
}

function yamlScalar(raw: string): string {
  let s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

function yamlField(fm: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)`, "im");
  const m = fm.match(re);
  if (!m) return undefined;
  const v = yamlScalar(m[1] ?? "");
  return v || undefined;
}

export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const s = (raw || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!s.startsWith("---\n") && s !== "---") {
    return { frontmatter: "", body: s };
  }
  const end = s.indexOf("\n---", 3);
  if (end < 0) return { frontmatter: "", body: s };
  let rest = s.slice(end + 4);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  return { frontmatter: s.slice(4, end).trim(), body: rest };
}

export function extractCmsArticlePaste(raw: string): CmsArticlePaste {
  const { frontmatter, body } = splitFrontmatter(raw);
  const formatted = formatCmsMarkdownBody(body);
  if (!frontmatter) return { body: formatted };
  return {
    body: formatted,
    title: yamlField(frontmatter, "title"),
    slug: yamlField(frontmatter, "slug"),
    seoTitle: yamlField(frontmatter, "seo_title"),
    seoDescription: yamlField(frontmatter, "seo_description"),
  };
}

export function looksLikeMarkdown(text: string): boolean {
  const s = text || "";
  if (s.startsWith("---\n") || s.startsWith("---\r\n")) return true;
  if (/(?:^|\n)#{1,3}\s+\S/.test(s)) return true;
  if (/\*\*[^*]+\*\*/.test(s)) return true;
  if (/(?:^|\n)>\s+\S/.test(s)) return true;
  if (/(?:^|\n)(?:[-*]|\d+\.)\s+\S/.test(s)) return true;
  if (/!\[[^\]]*\]\(cms-media:\d+\)/.test(s)) return true;
  if (/\[[^\]]+\]\((\/app\/|https?:\/\/)/.test(s)) return true;
  return false;
}

export function wrapLine(text: string, width = WRAP): string {
  const tokens = text.trim().match(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\S+)/g) ?? [];
  if (!tokens.length) return "";
  const lines: string[] = [];
  let line = "";
  for (const w of tokens) {
    if (!line) {
      line = w;
      continue;
    }
    if (line.length + 1 + w.length <= width) line += ` ${w}`;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}

export function formatCmsMarkdownBody(md: string): string {
  const blocks = parseCmsMarkdown(md);
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "p") out.push(wrapLine(block.text));
    else if (block.type === "h") out.push(`${"#".repeat(block.level)} ${block.text.trim()}`);
    else if (block.type === "ul") out.push(block.items.map((it) => `- ${it.trim()}`).join("\n"));
    else if (block.type === "ol") out.push(block.items.map((it, i) => `${i + 1}. ${it.trim()}`).join("\n"));
    else if (block.type === "quote") out.push(wrapLine(block.text).split("\n").map((l) => `> ${l}`).join("\n"));
    else out.push(`\`\`\`\n${block.text}\n\`\`\``);
  }
  return `${out.join("\n\n").trim()}\n`;
}

export function formatCmsArticleDocument(raw: string): string {
  const { frontmatter, body } = splitFrontmatter(raw);
  const formattedBody = formatCmsMarkdownBody(body);
  if (!frontmatter) return formattedBody;
  return `---\n${frontmatter.trim()}\n---\n\n${formattedBody}`;
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) ?? "";
}

function childMarkdown(el: Element): string {
  return [...el.childNodes].map(nodeToMarkdown).join("");
}

function nodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") return "\n";
  if (tag === "span" && el.hasAttribute("data-cms-media")) {
    const id = attr(el, "data-cms-media");
    const alt = attr(el, "data-alt") || (el.textContent ?? "").replace(/^\[image:\s?/, "").replace(/\]$/, "");
    return `![${alt}](cms-media:${id})`;
  }
  const inner = childMarkdown(el);
  switch (tag) {
    case "strong":
    case "b":
      return `**${inner}**`;
    case "em":
    case "i":
      return `*${inner}*`;
    case "u":
      return inner;
    case "code":
      return `\`${inner}\``;
    case "a": {
      const href = attr(el, "href");
      if (!href || /^(javascript|data):/i.test(href)) return inner;
      return `[${inner}](${href})`;
    }
    case "h2":
      return `\n\n## ${inner.trim()}\n\n`;
    case "h3":
      return `\n\n### ${inner.trim()}\n\n`;
    case "p":
    case "div":
      return `\n\n${inner}\n\n`;
    case "blockquote":
      return `\n\n${inner.trim().split(/\n+/).map((l) => `> ${l.trim()}`).join("\n")}\n\n`;
    case "li":
      return inner.trim();
    case "ul":
      return `\n\n${[...el.children]
        .filter((c) => c.tagName.toLowerCase() === "li")
        .map((li) => `- ${nodeToMarkdown(li).trim()}`)
        .join("\n")}\n\n`;
    case "ol":
      return `\n\n${[...el.children]
        .filter((c) => c.tagName.toLowerCase() === "li")
        .map((li, i) => `${i + 1}. ${nodeToMarkdown(li).trim()}`)
        .join("\n")}\n\n`;
    case "pre":
      return `\n\n\`\`\`\n${el.textContent ?? ""}\n\`\`\`\n\n`;
    default:
      return inner;
  }
}

export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === "undefined") {
    return formatCmsMarkdownBody(html.replace(/<[^>]+>/g, " "));
  }
  const doc = new DOMParser().parseFromString(`<div id="cms-root">${html}</div>`, "text/html");
  const root = doc.getElementById("cms-root") ?? doc.body;
  const md = [...root.childNodes].map(nodeToMarkdown).join("");
  return formatCmsMarkdownBody(md);
}
