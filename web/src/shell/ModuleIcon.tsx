import type { JSX } from "solid-js";

type Props = {
  id: string;
  class?: string;
};

const iconClass = "h-[18px] w-[18px] shrink-0";

export function ModuleIcon(props: Props): JSX.Element {
  const cls = () => props.class ?? iconClass;

  switch (props.id) {
    case "inventory":
      return (
        <svg class={cls()} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h10" />
          <rect x="3" y="4" width="18" height="16" rx="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      );
    case "quotation":
      return (
        <svg class={cls()} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    default:
      return (
        <svg class={cls()} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
          <rect x="4" y="4" width="16" height="16" rx="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      );
  }
}
