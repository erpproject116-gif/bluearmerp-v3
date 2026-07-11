import { For, Show } from "solid-js";
import { A } from "@solidjs/router";
import type { HelpReplyHit } from "./helpTypes";

export function HelpResultCard(props: { hit: HelpReplyHit }) {
  return (
    <article class="rounded-lg border border-stroke bg-slate-50/80 p-3 text-sm">
      <h4 class="font-semibold text-text-primary">{props.hit.title}</h4>
      <Show when={props.hit.scenario}>
        {(s) => <p class="mt-1 text-xs text-text-secondary">{s()}</p>}
      </Show>
      <p class="mt-2 text-text-primary">{props.hit.snippet}</p>
      <Show when={props.hit.steps?.length}>
        <ol class="mt-2 list-decimal space-y-1 pl-4 text-xs text-text-secondary">
          <For each={props.hit.steps}>{(step) => <li>{step}</li>}</For>
        </ol>
      </Show>
      <div class="mt-3 flex flex-wrap gap-2">
        <A
          href={props.hit.articleHref}
          class="rounded border border-stroke bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        >
          Open article
        </A>
        <Show when={props.hit.actionHref && props.hit.actionLabel}>
          <A
            href={props.hit.actionHref!}
            class="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700"
          >
            {props.hit.actionLabel}
          </A>
        </Show>
      </div>
    </article>
  );
}
