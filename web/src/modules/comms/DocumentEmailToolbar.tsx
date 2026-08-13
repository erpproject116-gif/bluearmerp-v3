import { createSignal, Show } from "solid-js";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { SendEmailModal } from "./SendEmailModal";
import { ShareToChatModal } from "./ShareToChatModal";

export type DocumentEmailToolbarProps = {
  docId?: number | null;
  sendUrl: string;
  title?: string;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** When set, shows Share to Team Chat beside Email. */
  shareEntityType?: string;
  shareLabel?: string;
};

export function DocumentEmailToolbar(props: DocumentEmailToolbarProps) {
  const auth = useAuth();
  const [open, setOpen] = createSignal(false);
  const [shareOpen, setShareOpen] = createSignal(false);
  const canSend = () => hasPermission(auth.me, "comms.send", "write");
  const canChat = () => hasPermission(auth.me, "comms.chat", "write");
  const docId = () => props.docId ?? 0;
  const shareType = () => props.shareEntityType?.trim() || "";
  const shareLabel = () => props.shareLabel?.trim() || props.title || `Document #${docId()}`;

  return (
    <>
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
      <Show when={canChat() && docId() > 0 && shareType()}>
        <>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-slate-50"
            onClick={() => setShareOpen(true)}
            aria-label="Share to Team Chat"
          >
            Share to chat
          </button>
          <ShareToChatModal
            open={shareOpen()}
            onClose={() => setShareOpen(false)}
            entityType={shareType()}
            entityId={docId()}
            label={shareLabel()}
          />
        </>
      </Show>
    </>
  );
}
