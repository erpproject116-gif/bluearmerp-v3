import { Dynamic } from "solid-js/web";
import { uiLabel } from "./branding/uiLabel";

type Props = {
  class?: string;
  as?: "span" | "p" | "li" | "td";
};

/** Tenant-editable loading message for inline UI. */
export function LoadingText(props: Props) {
  return (
    <Dynamic component={props.as ?? "span"} class={props.class}>
      {uiLabel("common.loading")}
    </Dynamic>
  );
}

/** Loading state for print preview pages. */
export function PrintLoading() {
  return <p class="quotation-print__loading">{uiLabel("print.loading")}</p>;
}
