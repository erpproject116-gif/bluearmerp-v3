import { A } from "@solidjs/router";
import { For } from "solid-js";
import { releaseNotes } from "../documentation/releaseNotes";

/** Home → Recent updates: product releases and feature upgrades (not user activity). */
export function HomeProductUpdates() {
  return (
    <div class="mx-auto max-w-3xl">
      <header class="mb-6">
        <p class="text-xs font-medium uppercase tracking-wide text-brand-600">Recent updates</p>
        <h2 class="mt-1 text-xl font-semibold text-text-primary">What&apos;s new in BluearmERP</h2>
        <p class="mt-2 text-sm text-text-secondary">
          Feature, module, and release notes in plain language. For day-to-day business events, open{" "}
          <A href="/app/activity-logs" class="font-medium text-brand-600 hover:underline">
            Activity logs
          </A>
          .
        </p>
      </header>

      <ul class="space-y-6">
        <For each={releaseNotes}>
          {(note) => (
            <li class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <p class="text-xs font-semibold uppercase tracking-wide text-brand-600">{note.date}</p>
              <h3 class="mt-1 text-base font-semibold text-text-primary">{note.title}</h3>
              <ul class="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-text-primary">
                <For each={note.bullets}>{(b) => <li>{b}</li>}</For>
              </ul>
            </li>
          )}
        </For>
      </ul>

      <p class="mt-8 text-sm text-text-secondary">
        Full archive:{" "}
        <A href="/app/documentation/whats-new" class="font-medium text-brand-600 hover:underline">
          Help → What&apos;s New
        </A>
      </p>
    </div>
  );
}
