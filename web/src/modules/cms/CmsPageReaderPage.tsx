import { A, Navigate, useParams } from "@solidjs/router";
import { Show, createEffect, onCleanup } from "solid-js";
import { useCmsPageBySlug } from "../../shared/useCms";
import { CmsMarkdown } from "./CmsMarkdown";
import { fetchCmsMediaObjectUrl } from "../../shared/cmsMedia";
import { createSignal } from "solid-js";

export default function CmsPageReaderPage() {
  const params = useParams();
  const slug = () => (params.slug ?? "").toLowerCase();
  const q = useCmsPageBySlug(slug);
  const [heroUrl, setHeroUrl] = createSignal<string | null>(null);

  createEffect(() => {
    const page = q.data?.page;
    const title = page?.seo_title?.trim() || page?.title;
    if (title) document.title = title;
  });

  createEffect(() => {
    const id = q.data?.page?.featured_media_id;
    let revoked: string | null = null;
    if (!id) {
      setHeroUrl(null);
      return;
    }
    void fetchCmsMediaObjectUrl(id).then((url) => {
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
      <A href="/app/cms" class="text-sm text-brand-600 hover:underline">← Pages</A>
      <Show when={q.data?.redirect_to}>
        <Navigate href={`/app/cms/p/${q.data!.redirect_to}`} />
      </Show>
      <Show when={q.isError}>
        <p class="mt-3 text-sm text-red-600">{(q.error as Error)?.message}</p>
      </Show>
      <Show when={q.data?.page}>
        {(p) => (
          <article class="mx-auto mt-4 max-w-3xl space-y-4">
            <h1 class="text-2xl font-semibold text-text-primary">{p().title}</h1>
            <Show when={p().seo_description}>
              <p class="text-sm text-text-secondary">{p().seo_description}</p>
            </Show>
            <Show when={heroUrl()}>
              <img src={heroUrl()!} alt="" class="max-h-80 w-full rounded-lg border border-stroke object-contain" />
            </Show>
            <CmsMarkdown content={p().body ?? ""} />
          </article>
        )}
      </Show>
    </div>
  );
}
