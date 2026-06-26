import { Show } from "solid-js";
import { canViewCrm, useAuth } from "./auth-context";
import { stageStyle } from "./branding/brandingStore";
import { taskStageLabel } from "./crmTaskStages";
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

function summaryBadge(summary: FollowUpTaskSummary | null | undefined) {
  const open = summary?.open_count ?? 0;
  const stage = summary?.latest_stage ?? "scheduled";
  if (open > 0) return `${open} open · ${taskStageLabel(stage)}`;
  if (summary?.latest_stage) return taskStageLabel(stage);
  return "View task";
}

function summaryPreview(summary: FollowUpTaskSummary | null | undefined) {
  const notes = summary?.latest_notes?.trim();
  if (notes) return truncate(notes, 48);
  const title = summary?.latest_title?.trim();
  if (title) return truncate(title, 48);
  return "";
}

function normalizeTaskId(raw: unknown): number | undefined {
  if (raw == null) return undefined;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function CrmTaskCell(props: Props) {
  const auth = useAuth();
  const modal = useCrmTaskModalOptional();
  const summary = () => props.summary;
  const latestId = () => normalizeTaskId(summary()?.latest_task_id);
  const preview = () => summaryPreview(summary());

  return (
    <Show
      when={canViewCrm(auth.me) && modal}
      fallback={<span class="text-xs text-text-secondary">—</span>}
    >
      <Show
        when={latestId()}
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
          <span
            class="rounded px-1.5 py-0.5 text-[10px] font-medium"
            style={stageStyle(summary()?.latest_stage ?? "scheduled")}
          >
            {summaryBadge(summary())}
          </span>
          <Show when={preview()}>
            <span class="text-[11px] leading-snug text-text-secondary" title={preview()}>
              {preview()}
            </span>
          </Show>
        </button>
      </Show>
    </Show>
  );
}
