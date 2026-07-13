import { createEffect, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { handleSaveResult } from "../../shared/handleSaveResult";
import { useToast } from "../../shared/toast";

export type SendEmailModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  sendUrl: string;
  defaultTo?: string;
  defaultCc?: string;
  defaultSubject?: string;
  defaultBody?: string;
  onSent?: () => void;
};

function splitAddrs(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SendEmailModal(props: SendEmailModalProps) {
  const toast = useToast();
  const [toAddrs, setToAddrs] = createSignal("");
  const [ccAddrs, setCcAddrs] = createSignal("");
  const [subject, setSubject] = createSignal("");
  const [bodyText, setBodyText] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  createEffect(() => {
    if (!props.open) return;
    setToAddrs(props.defaultTo ?? "");
    setCcAddrs(props.defaultCc ?? "");
    setSubject(props.defaultSubject ?? "");
    setBodyText(props.defaultBody ?? "");
  });

  const send = async () => {
    const to = splitAddrs(toAddrs());
    if (to.length === 0) {
      toast.warning("At least one recipient email is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<unknown>(
      props.sendUrl,
      {
        method: "POST",
        body: JSON.stringify({
          to_addrs: to,
          cc_addrs: splitAddrs(ccAddrs()),
          subject: subject().trim(),
          body_text: bodyText().trim(),
        }),
      },
      { silent: true },
    );
    setSaving(false);
    if (!handleSaveResult(res, toast, "Email sent.")) return;
    props.onSent?.();
    props.onClose();
  };

  return (
    <EntityModal
      open={props.open}
      title={props.title ?? "Send by email"}
      onClose={props.onClose}
      onSave={() => void send()}
      saving={saving()}
      singleColumn
      stacked
    >
      <Field label="To *" span="full">
        <input
          class={inputClass}
          value={toAddrs()}
          placeholder="email@example.com, other@example.com"
          onInput={(e) => setToAddrs(e.currentTarget.value)}
        />
      </Field>
      <Field label="Cc" span="full">
        <input
          class={inputClass}
          value={ccAddrs()}
          placeholder="Optional"
          onInput={(e) => setCcAddrs(e.currentTarget.value)}
        />
      </Field>
      <Field label="Subject" span="full">
        <input class={inputClass} value={subject()} placeholder="Leave blank to use template" onInput={(e) => setSubject(e.currentTarget.value)} />
      </Field>
      <Field label="Message" span="full">
        <textarea
          class={inputClass}
          rows={6}
          value={bodyText()}
          placeholder="Leave blank to use template"
          onInput={(e) => setBodyText(e.currentTarget.value)}
        />
      </Field>
    </EntityModal>
  );
}
