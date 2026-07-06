import { RecordHistoryButton } from "./RecordHistoryButton";

type Props = {
  module: string;
  targetType: string;
  targetId: number;
  title?: string;
  class?: string;
};

/** Grid-cell history link — opens scoped history modal for one transaction. */
export function ActivityHistoryLink(props: Props) {
  return (
    <RecordHistoryButton
      targetType={props.targetType}
      targetId={props.targetId}
      title={props.title}
      class={props.class}
    />
  );
}
