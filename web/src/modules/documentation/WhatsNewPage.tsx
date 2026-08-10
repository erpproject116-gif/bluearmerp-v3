import { For } from "solid-js";
import { A } from "@solidjs/router";
import { DocumentationHeaderTabs } from "./DocumentationLayout";
import { releaseNotes } from "./releaseNotes";

export default function WhatsNewPage() {
  return (
    <div class="mx-auto max-w-6xl">
      <DocumentationHeaderTabs active="whats-new" />
      <article class="max-w-2xl rounded-xl border border-stroke bg-white p-6 shadow-sm lg:p-8">
        <header class="border-b border-stroke pb-5">
          <h1 class="text-2xl font-semibold tracking-tight text-text-primary">What’s New</h1>
          <p class="mt-2 text-sm leading-relaxed text-text-secondary">
            Recent product updates in plain language. For how-to steps, see{" "}
            <A href="/app/documentation" class="font-medium text-brand-600 hover:underline">
              Guides
            </A>{" "}
            or the{" "}
            <A href="/app/documentation/kb" class="font-medium text-brand-600 hover:underline">
              Knowledge base
            </A>
            .
          </p>
        </header>
        <ul class="mt-6 space-y-6">
          <For each={releaseNotes}>
            {(note) => (
              <li>
                <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">{note.date}</p>
                <h2 class="mt-1 text-base font-semibold text-text-primary">{note.title}</h2>
                <ul class="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-primary">
                  <For each={note.bullets}>{(b) => <li>{b}</li>}</For>
                </ul>
              </li>
            )}
          </For>
        </ul>
      </article>
    </div>
  );
}
