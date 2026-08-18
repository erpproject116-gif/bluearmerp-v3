import { For, Show } from "solid-js";
import { firstParagraphPlain } from "./cmsMarkdownCodec";
import { cmsSeoChecks, givenSeoDescription, givenSeoTitle, serpDescLen, serpTitleLen } from "./cmsSeo";

export function CmsSeoPanel(props: {
  title: string;
  topic: string;
  slug: string;
  permalink: string;
  body: string;
  seoTitle: string;
  seoDescription: string;
  featuredMediaId: number | null;
  featuredMediaAlt?: string | null;
  focusPhrase: string;
  siteUrl?: string;
}) {
  const first = () => firstParagraphPlain(props.body);
  const displayTitle = () => givenSeoTitle(props.title, props.seoTitle);
  const displayDesc = () => givenSeoDescription(props.body, props.seoDescription, first());
  const titleLen = () => serpTitleLen(displayTitle());
  const descLen = () => serpDescLen(displayDesc());
  const checks = () =>
    cmsSeoChecks({
      title: props.title,
      topic: props.topic,
      slug: props.slug,
      body: props.body,
      seoTitle: props.seoTitle,
      seoDescription: props.seoDescription,
      featuredMediaId: props.featuredMediaId,
      featuredMediaAlt: props.featuredMediaAlt,
      focusPhrase: props.focusPhrase,
      series: "sme-walang-sistema",
    });
  const usingDefaultTitle = () => !(props.seoTitle || "").trim();
  const usingDefaultDesc = () => !(props.seoDescription || "").trim();
  return (
    <section class="rounded-lg border border-stroke bg-slate-50 p-3 space-y-3">
      <h2 class="text-sm font-semibold text-text-primary">Search & share</h2>
      <div class="rounded-md border border-stroke bg-white p-3">
        <p class="text-xs text-text-secondary">{props.permalink}</p>
        <p class="text-base text-blue-800">{displayTitle()}</p>
        <p class="text-sm text-text-secondary">{displayDesc()}</p>
        <Show when={usingDefaultTitle()}>
          <p class="mt-1 text-xs text-text-secondary">Using default: from title</p>
        </Show>
        <Show when={usingDefaultDesc()}>
          <p class="text-xs text-text-secondary">Using default: from first paragraph</p>
        </Show>
        <p class="mt-2 text-xs text-text-secondary">
          Title {titleLen().chars} chars ({titleLen().band}) · Description {descLen().chars} chars ({descLen().band})
        </p>
      </div>
      <ul class="space-y-1 text-sm">
        <For each={checks()}>
          {(c) => (
            <li class={c.ok ? "text-emerald-700" : c.warn ? "text-amber-700" : "text-red-700"}>
              {c.ok ? "Pass" : "Warn"} — {c.label}
            </li>
          )}
        </For>
      </ul>
    </section>
  );
}
