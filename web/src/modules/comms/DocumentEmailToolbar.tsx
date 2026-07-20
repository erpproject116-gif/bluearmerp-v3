import { createSignal, Show } from "solid-js";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { SendEmailModal } from "./SendEmailModal";

export type DocumentEmailToolbarProps = {
  docId?: number | null;
  sendUrl: string;
  title?: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
};

export function DocumentEmailToolbar(props: DocumentEmailToolbarProps) {
  const auth = useAuth();
  const [open, setOpen] = createSignal(false);
  const canSend = () => hasPermission(auth.me, "comms.send", "write");
  const docId = () => props.docId ?? 0;

  return (
    <Show when={canSend() && docId() > 0}>
      <>
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
          onClick={() => setOpen(true)}
        >
          Email
        </button>
        <SendEmailModal
          open={open()}
          onClose={() => setOpen(false)}
          title={props.title ?? "Send by email"}
          sendUrl={props.sendUrl.replace("{id}", String(docId()))}
          defaultTo={props.defaultTo}
          defaultSubject={props.defaultSubject}
          defaultBody={props.defaultBody}
        />
      </>
    </Show>
  );
}
