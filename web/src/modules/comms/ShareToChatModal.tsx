import { For, Show, createEffect, createSignal } from "solid-js";
import { hasPermission, useAuth } from "../../shared/auth-context";
import { useToast } from "../../shared/toast";
import { listChatChannels, postChatMessage, type ChatChannel } from "./chatApi";

export type ShareToChatModalProps = {
  open: boolean;
  onClose: () => void;
  entityType: string;
  entityId: number;
  label: string;
  href?: string;
};

export function ShareToChatModal(props: ShareToChatModalProps) {
  const auth = useAuth();
  const toast = useToast();
  const [channels, setChannels] = createSignal<ChatChannel[]>([]);
  const [channelId, setChannelId] = createSignal<number | null>(null);
  const [note, setNote] = createSignal("");
  const [sending, setSending] = createSignal(false);
  const canChat = () => hasPermission(auth.me, "comms.chat", "write");

  createEffect(() => {
    if (!props.open || !canChat()) return;
    void listChatChannels().then((res) => {
      if (res.success) {
        const rows = res.data ?? [];
        setChannels(rows);
        if (!channelId() && rows[0]) setChannelId(rows[0].id);
      }
    });
  });

  const handleShare = async () => {
    const id = channelId();
    if (!id || sending()) return;
    setSending(true);
    const res = await postChatMessage(id, {
      body: note().trim() || `Shared ${props.label}`,
      links: [
        {
          entity_type: props.entityType,
          entity_id: props.entityId,
          label: props.label,
        },
      ],
    });
    setSending(false);
    if (!res.success) {
      toast.error(res.message || "Failed to share to Team Chat.");
      return;
    }
    toast.success("Shared to Team Chat.");
    setNote("");
    props.onClose();
  };

  return (
    <Show when={props.open && canChat()}>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Share to Team Chat"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") props.onClose();
        }}
      >
        <div class="w-full max-w-md rounded-xl border border-stroke bg-surface p-4 shadow-lg">
          <h2 class="text-base font-semibold text-text-primary">Share to Team Chat</h2>
          <p class="mt-1 text-sm text-text-secondary">{props.label}</p>
          <label class="mt-3 block text-xs font-medium text-text-secondary" for="share-chat-channel">
            Conversation
          </label>
          <select
            id="share-chat-channel"
            class="mt-1 w-full rounded-lg border border-stroke px-2 py-2 text-sm"
            value={channelId() ?? ""}
            onChange={(e) => setChannelId(Number(e.currentTarget.value) || null)}
          >
            <For each={channels()}>
              {(ch) => (
                <option value={ch.id}>
                  {ch.type === "channel" ? `# ${ch.name}` : ch.name}
                </option>
              )}
            </For>
          </select>
          <label class="mt-3 block text-xs font-medium text-text-secondary" for="share-chat-note">
            Note (optional)
          </label>
          <textarea
            id="share-chat-note"
            class="mt-1 w-full rounded-lg border border-stroke px-2 py-2 text-sm"
            rows={3}
            value={note()}
            onInput={(e) => setNote(e.currentTarget.value)}
          />
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-3 py-1.5 text-sm"
              onClick={() => props.onClose()}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              disabled={!channelId() || sending()}
              onClick={() => void handleShare()}
            >
              Share
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
