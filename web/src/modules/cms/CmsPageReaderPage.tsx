import { A, Navigate, useParams } from "@solidjs/router";
import { Show, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { useCmsPageBySlug, usePublicCmsPageBySlug } from "../../shared/useCms";
import { CmsMarkdown } from "./CmsMarkdown";
import { fetchPublicCmsMediaObjectUrl } from "../../shared/cmsMedia";
import { splitFrontmatter } from "./cmsMarkdownCodec";
import { CMS_ARTICLES_PREFIX, cmsArticlePath, cmsTopicOrDefault, cmsTopicPath } from "./cmsPermalink";

export default function CmsPageReaderPage() {
  const params = useParams();
  const slug = () => (params.slug ?? "").toLowerCase();
  const topicParam = () => (params.topic ?? "").toLowerCase();
  const q = usePublicCmsPageBySlug(slug);
  const [heroUrl, setHeroUrl] = createSignal<string | null>(null);

  const page = () => q.data?.page;
  const bodyMd = createMemo(() => splitFrontmatter(page()?.body ?? "").body.trim());

  createEffect(() => {
    const p = page();
    const title = p?.seo_title?.trim() || p?.title;
    if (title) document.title = title;
  });

  createEffect(() => {
    const id = page()?.featured_media_id;
    let revoked: string | null = null;
    if (!id) {
      setHeroUrl(null);
      return;
    }
    void fetchPublicCmsMediaObjectUrl(id).then((url) => {
      revoked = url;
      setHeroUrl(url);
    });
    onCleanup(() => {
      if (revoked) URL.revokeObjectURL(revoked);
    });
  });

  onCleanup(() => {
    document.title = "Bluearm ERP";
  });

  return (
    <div>
      <Show when={q.data?.redirect_to}>
        <Navigate href={q.data!.redirect_to!} />
      </Show>
      <Show when={q.isError}>
        <p class="mt-3 text-sm text-red-600">{(q.error as Error)?.message}</p>
      </Show>
      <Show when={page()}>
        {(p) => {
          const canonical = () => p().permalink || cmsArticlePath(p().topic, p().slug);
          const topic = () => cmsTopicOrDefault(p().topic);
          return (
            <>
              <Show when={topicParam() && topicParam() !== topic()}>
                <Navigate href={canonical()} />
              </Show>
              <article class="mx-auto mt-2 max-w-3xl space-y-4">
                <nav class="text-sm text-text-secondary">
                  <A href={CMS_ARTICLES_PREFIX} class="text-brand-600 hover:underline">Articles</A>
                  <span class="px-1">/</span>
                  <A href={cmsTopicPath(topic())} class="text-brand-600 hover:underline">{topic()}</A>
                </nav>
                <h1 class="text-2xl font-semibold text-text-primary">{p().title}</h1>
                <Show when={p().seo_description}>
                  <p class="text-sm text-text-secondary">{p().seo_description}</p>
                </Show>
                <Show when={heroUrl()}>
                  <img src={heroUrl()!} alt="" class="max-h-80 w-full rounded-lg border border-stroke object-contain" />
                </Show>
                <Show
                  when={bodyMd()}
                  fallback={
                    <p class="rounded-lg border border-stroke bg-slate-50 p-3 text-sm text-text-secondary">
                      This page has no body yet.
                    </p>
                  }
                >
                  <CmsMarkdown content={bodyMd()} class="text-base" publicMedia />
                </Show>
              </article>
            </>
          );
        }}
      </Show>
    </div>
  );
}

/** Old /app/cms/p/:slug links follow the page’s topic permalink (signed-in tenant catalog). */
export function CmsLegacyArticleRedirect() {
  const params = useParams();
  const slug = () => (params.slug ?? "").toLowerCase();
  const q = useCmsPageBySlug(slug);
  return (
    <div>
      <Show when={q.data?.redirect_to}>
        <Navigate href={q.data!.redirect_to!} />
      </Show>
      <Show when={q.data?.page}>
        {(p) => <Navigate href={p().permalink || cmsArticlePath(p().topic, p().slug)} />}
      </Show>
      <Show when={q.isError}>
        <p class="mt-3 text-sm text-red-600">{(q.error as Error)?.message}</p>
      </Show>
    </div>
  );
}
