import { A, useParams } from "@solidjs/router";
import { For, Show, createMemo } from "solid-js";
import { usePublicCmsPages, type CmsPage } from "../../shared/useCms";
import { CMS_ARTICLES_PREFIX, cmsArticlePath, cmsTopicOrDefault, cmsTopicPath } from "./cmsPermalink";

export default function CmsArticlesHubPage() {
  const params = useParams();
  const topicFilter = () => (params.topic ? cmsTopicOrDefault(params.topic) : "");
  const list = usePublicCmsPages(() => ({
    page: 1,
    pageSize: 100,
    topic: topicFilter() || undefined,
  }));

  const groups = createMemo(() => {
    const rows = list.data?.rows ?? [];
    const map = new Map<string, CmsPage[]>();
    for (const row of rows) {
      const topic = cmsTopicOrDefault(row.topic);
      const cur = map.get(topic) ?? [];
      cur.push(row);
      map.set(topic, cur);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  });

  return (
    <div class="mx-auto max-w-3xl space-y-6">
      <div>
        <Show when={topicFilter()} fallback={<h1 class="text-2xl font-semibold text-text-primary">Articles</h1>}>
          <p class="text-sm text-text-secondary">
            <A href={CMS_ARTICLES_PREFIX} class="text-brand-600 hover:underline">Articles</A>
            <span class="px-1">/</span>
            <span>{topicFilter()}</span>
          </p>
          <h1 class="mt-1 text-2xl font-semibold text-text-primary">{topicFilter()}</h1>
        </Show>
        <p class="mt-1 text-sm text-text-secondary">Published pages grouped by topic cluster.</p>
      </div>
      <Show when={list.isError}>
        <p class="text-sm text-red-600">{(list.error as Error)?.message}</p>
      </Show>
      <Show when={!list.isFetching && (list.data?.rows ?? []).length === 0}>
        <p class="text-sm text-text-secondary">No published articles in this cluster yet.</p>
      </Show>
      <For each={groups()}>
        {([topic, pages]) => (
          <section class="space-y-2">
            <Show when={!topicFilter()}>
              <h2 class="text-base font-semibold text-text-primary">
                <A class="hover:underline" href={cmsTopicPath(topic)}>{topic}</A>
              </h2>
            </Show>
            <ul class="space-y-2">
              <For each={pages}>
                {(row) => (
                  <li>
                    <A class="text-brand-600 hover:underline" href={row.permalink || cmsArticlePath(row.topic, row.slug)}>
                      {row.title}
                    </A>
                    <Show when={row.seo_description}>
                      <p class="text-sm text-text-secondary">{row.seo_description}</p>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </section>
        )}
      </For>
    </div>
  );
}
