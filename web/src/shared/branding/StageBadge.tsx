import { stageStyle } from "./brandingStore";

type Props = {
  status: string;
  label?: string;
  class?: string;
};

export function StageBadge(props: Props) {
  const style = () => stageStyle(props.status);
  return (
    <span
      class={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${props.class ?? ""}`}
      style={style()}
    >
      {props.label ?? props.status.replaceAll("_", " ")}
    </span>
  );
}
