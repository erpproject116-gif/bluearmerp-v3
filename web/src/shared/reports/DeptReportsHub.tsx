import { A } from "@solidjs/router";
import { For, Show } from "solid-js";

export type ReportHubLink = {
  label: string;
  href: string;
  blurb?: string;
};

export function DeptReportsHub(props: {
  title: string;
  description: string;
  links: ReportHubLink[];
}) {
  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-surface p-6 shadow-sm">
        <h2 class="text-xl font-semibold text-text-primary">{props.title}</h2>
        <p class="mt-1 max-w-2xl text-sm text-text-secondary">{props.description}</p>
        <div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={props.links}>
            {(link) => (
              <A
                href={link.href}
                class="rounded-xl border border-stroke bg-panel px-4 py-4 transition hover:border-brand-500 hover:bg-brand-50"
              >
                <p class="text-sm font-semibold text-text-primary">{link.label}</p>
                <Show when={link.blurb}>
                  <p class="mt-1 text-xs text-text-secondary">{link.blurb}</p>
                </Show>
              </A>
            )}
          </For>
        </div>
      </section>
    </div>
  );
}
