import { uiLabel } from "../branding/uiLabel";

export function ReportLoadingRow(props: { colSpan: number; class?: string }) {
  return (
    <tr>
      <td colSpan={props.colSpan} class={props.class ?? "px-3 py-8 text-center text-text-secondary"}>
        {uiLabel("common.loading")}
      </td>
    </tr>
  );
}

export function ReportEmptyRow(props: { colSpan: number; class?: string }) {
  return (
    <tr>
      <td colSpan={props.colSpan} class={props.class ?? "px-3 py-8 text-center text-text-secondary"}>
        {uiLabel("reports.no_filter_match")}
      </td>
    </tr>
  );
}

export function ReportEmptyMessage(props: { class?: string; message?: string }) {
  return (
    <p class={props.class ?? "px-5 py-8 text-center text-sm text-text-secondary"}>
      {props.message ?? uiLabel("reports.no_filter_match")}
    </p>
  );
}
