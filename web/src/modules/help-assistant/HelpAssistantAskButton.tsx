import { Show } from "solid-js";
import { useHelpAssistantUi } from "./helpAssistantContext";

export function HelpAssistantAskButton(props: { query?: string; class?: string }) {
  const help = useHelpAssistantUi();

  return (
    <Show when={help}>
      <button
        type="button"
        class={
          props.class ??
          "inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100"
        }
        onClick={() => help!.openWithQuery(props.query ?? "")}
      >
        <span aria-hidden="true">?</span>
        Ask help assistant
      </button>
    </Show>
  );
}
