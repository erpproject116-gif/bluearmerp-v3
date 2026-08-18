import { For } from "solid-js";
import { EntityFormSettingsPage } from "../../shared/EntityFormSettingsPage";
import { CMS_ENTITY } from "../../shared/entityTypes";
import { useCmsTopics } from "../../shared/useCms";

export default function CmsPagesSettingsPage() {
  const topics = useCmsTopics();
  return (
    <div class="space-y-6">
      <section class="rounded-lg border border-stroke p-4">
        <h2 class="text-sm font-semibold text-text-primary">Topic registry</h2>
        <p class="mt-1 text-xs text-text-secondary">
          Topics are kebab-case clusters used in <code>/articles/{"{topic}"}/{"{slug}"}</code>. Suggested clusters appear even before you have pages.
        </p>
        <ul class="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          <For each={topics.data ?? []}>
            {(t) => (
              <li>
                <span class="font-mono text-text-primary">{t.topic}</span>
                <span class="text-text-secondary"> · {t.count} pages</span>
              </li>
            )}
          </For>
        </ul>
      </section>
      <EntityFormSettingsPage
        entityType={CMS_ENTITY.page}
        featureLabel="Pages"
        listHref="/app/cms"
      />
    </div>
  );
}
