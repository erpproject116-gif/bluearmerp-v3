import type { ParentComponent } from "solid-js";

/** Activity log pages use AppShell header nav; no duplicate in-page tabs. */
export const ActivityLogLayout: ParentComponent = (props) => (
  <div class="flex min-h-0 flex-1 flex-col">{props.children}</div>
);

export type ActivityLogFilterState = {
  dateFrom: string;
  dateTo: string;
  actorUserId: string;
  actionCode: string;
  targetType: string;
  targetId: string;
  module: string;
  referenceNo?: string;
};

export { ActivityLogFilterPanel } from "./ActivityLogFilters";
