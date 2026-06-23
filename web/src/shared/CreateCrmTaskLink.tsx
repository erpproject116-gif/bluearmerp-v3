import { Show } from "solid-js";
import { canViewCrm, useAuth } from "./auth-context";
import { useCrmTaskModalOptional, type CrmTaskContext } from "./CrmTaskModal";

type Props = {
  context: CrmTaskContext;
  label?: string;
  class?: string;
};

export function CreateCrmTaskLink(props: Props) {
  const auth = useAuth();
  const modal = useCrmTaskModalOptional();

  return (
    <Show when={canViewCrm(auth.me) && modal}>
      <button
        type="button"
        class={props.class ?? "text-xs text-brand-600 hover:underline"}
        onClick={(e) => {
          e.stopPropagation();
          modal?.open(props.context);
        }}
      >
        {props.label ?? "CRM task"}
      </button>
    </Show>
  );
}
