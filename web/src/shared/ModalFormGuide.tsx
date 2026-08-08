import { For, Show, createSignal } from "solid-js";
import { getModalFormGuide, type ModalFormGuideDef } from "./modalFormGuides";
import { useInlineGuides } from "./inlineGuides";

function expandedKey(guideId: string): string {
  return `modal-form-guide-expanded:${guideId}`;
}

/** First visit defaults to expanded so non-tech users see the tip. */
function readExpanded(guideId: string): boolean {
  try {
    const raw = localStorage.getItem(expandedKey(guideId));
    if (raw === "1") return true;
    if (raw === "0") return false;
    return true;
  } catch {
    return true;
  }
}

function writeExpanded(guideId: string, value: boolean) {
  try {
    localStorage.setItem(expandedKey(guideId), value ? "1" : "0");
  } catch {
    /* private mode — non-fatal */
  }
}

export type ModalFormGuideProps = {
  /** Registry key, or pass title/summary/steps directly. */
  guideId: string;
  title?: string;
  summary?: string;
  steps?: string[];
  docHref?: string;
  /** When true, wrap with col-span-full for EntityModal grids. */
  spanFull?: boolean;
};

function resolveGuide(props: ModalFormGuideProps): ModalFormGuideDef {
  const fromRegistry = getModalFormGuide(props.guideId);
  return {
    id: props.guideId,
    title: props.title ?? fromRegistry?.title ?? "Tip",
    summary: props.summary ?? fromRegistry?.summary ?? "",
    steps: props.steps ?? fromRegistry?.steps,
    docHref: props.docHref ?? fromRegistry?.docHref,
  };
}

/**
 * Collapsible plain-language tip for create/edit entity modals.
 * Persistence key: modal-form-guide-expanded:{guideId}
 */
export function ModalFormGuide(props: ModalFormGuideProps) {
  const guides = useInlineGuides();
  const guide = () => resolveGuide(props);
  const [expandedMap, setExpandedMap] = createSignal<Record<string, boolean>>({});

  const isExpanded = () => {
    const id = guide().id;
    const m = expandedMap();
    if (id in m) return m[id];
    return readExpanded(id);
  };

  const toggle = () => {
    const id = guide().id;
    const next = !isExpanded();
    setExpandedMap((m) => ({ ...m, [id]: next }));
    writeExpanded(id, next);
  };

  const body = (
    <section
      class="rounded-lg border border-brand-100 bg-brand-50/40"
      aria-label={`Form tip: ${guide().title}`}
    >
      <div class="flex flex-wrap items-center gap-2 px-3 py-2">
        <span class="rounded bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          Tip
        </span>
        <p class="min-w-0 flex-1 text-sm font-medium text-text-primary">{guide().title}</p>
        <button
          type="button"
          class="rounded-md border border-brand-200 bg-white px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
          aria-expanded={isExpanded()}
          onClick={toggle}
        >
          {isExpanded() ? "Hide" : "Show tip"}
        </button>
      </div>
      <Show when={isExpanded()}>
        <div class="border-t border-brand-100 px-3 py-2.5">
          <p class="text-sm leading-relaxed text-text-secondary">{guide().summary}</p>
          <Show when={(guide().steps?.length ?? 0) > 0}>
            <ol class="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              <For each={guide().steps}>{(step) => <li>{step}</li>}</For>
            </ol>
          </Show>
          <Show when={guide().docHref}>
            <a href={guide().docHref!} class="mt-2 inline-block text-xs font-medium text-brand-600 hover:underline">
              Read the full guide
            </a>
          </Show>
        </div>
      </Show>
    </section>
  );

  return (
    <Show when={guides.enabled()}>
      {props.spanFull ? <div class="col-span-full">{body}</div> : body}
    </Show>
  );
}
