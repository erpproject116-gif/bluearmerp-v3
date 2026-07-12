import { createSignal, Show } from "solid-js";
import { A } from "@solidjs/router";
import { For } from "solid-js";
import { recordHelpFeedback } from "./helpFeedback";
import type { HelpReplyHit } from "./helpTypes";

export function HelpResultCard(props: {
  hit: HelpReplyHit;
  query: string;
  pathname: string;
}) {
  const [vote, setVote] = createSignal<"up" | "down" | null>(null);

  const submit = (v: "up" | "down") => {
    if (vote()) return;
    recordHelpFeedback({
      query: props.query,
      pathname: props.pathname,
      articleId: props.hit.articleId,
      vote: v,
    });
    setVote(v);
  };

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
      <div class="mt-3 flex flex-wrap items-center gap-2">
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
        <span class="ml-auto flex items-center gap-1 text-[11px] text-text-secondary">
          <Show
            when={vote() === null}
            fallback={
              <span class="text-text-secondary">
                {vote() === "up" ? "Thanks — noted as helpful." : "Thanks — we'll improve this."}
              </span>
            }
          >
            <span class="mr-1">Helpful?</span>
            <button
              type="button"
              class="rounded border border-stroke bg-white px-1.5 py-0.5 hover:bg-emerald-50"
              aria-label="Mark helpful"
              onClick={() => submit("up")}
            >
              Yes
            </button>
            <button
              type="button"
              class="rounded border border-stroke bg-white px-1.5 py-0.5 hover:bg-rose-50"
              aria-label="Mark not helpful"
              onClick={() => submit("down")}
            >
              No
            </button>
          </Show>
        </span>
      </div>
    </article>
  );
}
