import { Show } from "solid-js";
import { canViewCrm, useAuth } from "./auth-context";
import { taskStageBadgeClass, taskStageLabel } from "./crmTaskStages";
import { useCrmTaskModalOptional, type CrmTaskContext } from "./CrmTaskModal";
import type { FollowUpTaskSummary } from "./useCrmTaskSummaries";

type Props = {
  context: CrmTaskContext;
  summary?: FollowUpTaskSummary | null;
  class?: string;
};

function truncate(text: string, max: number) {
  const s = text.trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function CrmTaskCell(props: Props) {
  const auth = useAuth();
  const modal = useCrmTaskModalOptional();
  const summary = () => props.summary;
  const openCount = () => summary()?.open_count ?? 0;
  const latestId = () => summary()?.latest_task_id;

  return (
    <Show when={canViewCrm(auth.me) && modal}>
      <Show
        when={openCount() > 0 && latestId()}
        fallback={
          <button
            type="button"
            class={props.class ?? "text-xs text-brand-600 hover:underline"}
            onClick={(e) => {
              e.stopPropagation();
              modal?.openCreate(props.context);
            }}
          >
            + Task
          </button>
        }
      >
        <button
          type="button"
          class="flex max-w-[10rem] flex-col items-start gap-0.5 text-left"
          onClick={(e) => {
            e.stopPropagation();
            const id = latestId();
            if (id) modal?.openTask(id);
          }}
        >
          <span class={`rounded px-1.5 py-0.5 text-[10px] font-medium ${taskStageBadgeClass(summary()?.latest_stage ?? "scheduled")}`}>
            {openCount()} open · {taskStageLabel(summary()?.latest_stage ?? "scheduled")}
          </span>
          <Show when={summary()?.latest_notes?.trim()}>
            <span class="text-[11px] leading-snug text-text-secondary" title={summary()?.latest_notes ?? ""}>
              {truncate(summary()?.latest_notes ?? "", 48)}
            </span>
          </Show>
        </button>
      </Show>
    </Show>
  );
}
