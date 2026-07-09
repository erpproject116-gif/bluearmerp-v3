import { uiLabel } from "./branding/uiLabel";

type Props = {
  class?: string;
  as?: "span" | "p" | "li" | "td";
};

/** Tenant-editable loading message for inline UI. */
export function LoadingText(props: Props) {
  const Tag = props.as ?? "span";
  return <Tag class={props.class}>{uiLabel("common.loading")}</Tag>;
}

/** Loading state for print preview pages. */
export function PrintLoading() {
  return <p class="quotation-print__loading">{uiLabel("print.loading")}</p>;
}
