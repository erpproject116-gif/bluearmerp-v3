import type { FollowUpTaskStage } from "./useFollowUpTasks";

export const TASK_STAGE_LABELS: Record<FollowUpTaskStage, string> = {
  scheduled: "Scheduled",
  due_soon: "Due soon",
  overdue: "Overdue",
  follow_up: "Follow-up",
  forwarded_sales: "Forwarded to sales",
  completed: "Completed",
  cancelled: "Cancelled",
  closed: "Closed",
};

export const TASK_BOARD_STAGES: { id: FollowUpTaskStage; label: string }[] = [
  { id: "scheduled", label: "Scheduled" },
  { id: "due_soon", label: "Due soon" },
  { id: "overdue", label: "Overdue" },
  { id: "follow_up", label: "Follow-up" },
  { id: "forwarded_sales", label: "Forwarded to sales" },
  { id: "completed", label: "Completed" },
  { id: "closed", label: "Closed" },
];

const stageBadgeClass: Record<FollowUpTaskStage, string> = {
  scheduled: "bg-slate-100 text-slate-700",
  due_soon: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  follow_up: "bg-brand-50 text-brand-700",
  forwarded_sales: "bg-violet-100 text-violet-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-100 text-slate-500",
  closed: "bg-slate-200 text-slate-700",
};

const stageBorderClass: Record<FollowUpTaskStage, string> = {
  scheduled: "border-l-slate-400",
  due_soon: "border-l-amber-500",
  overdue: "border-l-red-500",
  follow_up: "border-l-brand-500",
  forwarded_sales: "border-l-violet-500",
  completed: "border-l-emerald-500",
  cancelled: "border-l-slate-300",
  closed: "border-l-slate-500",
};

export function taskStageLabel(stage: string): string {
  return TASK_STAGE_LABELS[stage as FollowUpTaskStage] ?? stage.replace(/_/g, " ");
}

export function taskStageBadgeClass(stage: string): string {
  return stageBadgeClass[stage as FollowUpTaskStage] ?? "bg-slate-100 text-slate-700";
}

export function taskStageBorderClass(stage: string): string {
  return stageBorderClass[stage as FollowUpTaskStage] ?? "border-l-slate-300";
}

export function taskKanbanSeverity(stage: string): "info" | "warning" | "critical" | undefined {
  if (stage === "overdue") return "critical";
  if (stage === "due_soon") return "warning";
  return "info";
}
