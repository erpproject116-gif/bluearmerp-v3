import { useNavigate } from "@solidjs/router";
import { createSignal, For, Show } from "solid-js";
import { createOrGetDM } from "../modules/comms/chatApi";
import { presenceActivityLabel } from "./presenceLabels";
import { hasPermission, useAuth } from "./auth-context";
import { UserAvatar } from "./UserAvatar";
import { useToast } from "./toast";
import { useOnlinePresence, type PresenceUser } from "./usePresence";

const MAX_STACK = 4;

function formatSeen(iso: string): string {
  const d = new Date(iso);
  const sec = Math.round((Date.now() - d.getTime()) / 1000);
  if (sec < 15) return "Just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  return `${min}m ago`;
}

function activitySummary(user: PresenceUser): string {
  const verb = presenceActivityLabel(user.activity);
  return `${verb} ${user.current_label}`;
}

export function PresenceAvatars() {
  const auth = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnlinePresence(() => Boolean(auth.me));
  const [open, setOpen] = createSignal(false);
  const [messagingId, setMessagingId] = createSignal<number | null>(null);

  const users = () => online.data ?? [];
  const others = () => users().filter((u) => !u.is_self);
  const stack = () => others().slice(0, MAX_STACK);
  const overflow = () => Math.max(0, others().length - MAX_STACK);
  const canMessage = () => hasPermission(auth.me, "comms.chat", "write");

  const messageUser = async (user: PresenceUser, e?: MouseEvent) => {
    e?.stopPropagation();
    if (user.is_self || !canMessage() || messagingId() !== null) return;
    setMessagingId(user.user_id);
    try {
      const res = await createOrGetDM(user.user_id);
      if (!res.success || !res.data) {
        toast.error(res.message || "Failed to open DM.");
        return;
      }
      setOpen(false);
      navigate(`/app/comms/chat?channelId=${res.data.id}`);
    } finally {
      setMessagingId(null);
    }
  };

  const onlineIndicator = (className?: string) => (
    <span
      class={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 ${className ?? ""}`}
      aria-hidden="true"
    />
  );

  const avatarStackFace = (user: PresenceUser) => (
    <>
      <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" class="ring-2 ring-white" />
      {onlineIndicator()}
    </>
  );

  return (
    <div class="relative">
      <div class="flex items-center gap-1 rounded-lg border border-stroke px-2 py-1.5">
        <Show
          when={others().length > 0}
          fallback={
            <button
              type="button"
              class="flex items-center gap-2 px-1 text-xs text-text-secondary transition hover:text-text-primary"
              aria-expanded={open()}
              aria-haspopup="true"
              title="Who's online"
              onClick={() => setOpen((v) => !v)}
            >
              <span class="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Only you
            </button>
          }
        >
          <div class="flex items-center -space-x-2 pl-1">
            <For each={stack()}>
              {(user) => (
                <Show
                  when={canMessage()}
                  fallback={
                    <span class="relative inline-block">{avatarStackFace(user)}</span>
                  }
                >
                  <button
                    type="button"
                    class="relative inline-block rounded-full transition hover:ring-2 hover:ring-brand/40 disabled:opacity-60"
                    title={`Message ${user.full_name}`}
                    aria-label={`Message ${user.full_name}`}
                    disabled={messagingId() === user.user_id}
                    onClick={(e) => void messageUser(user, e)}
                  >
                    {avatarStackFace(user)}
                  </button>
                </Show>
              )}
            </For>
            <Show when={overflow() > 0}>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-2 ring-white transition hover:bg-slate-300"
                title="Who's online"
                aria-expanded={open()}
                aria-haspopup="true"
                onClick={() => setOpen((v) => !v)}
              >
                +{overflow()}
              </button>
            </Show>
          </div>
          <button
            type="button"
            class="flex items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium text-text-secondary transition hover:bg-slate-50"
            aria-expanded={open()}
            aria-haspopup="true"
            title="Who's online"
            onClick={() => setOpen((v) => !v)}
          >
            {others().length + 1} online
          </button>
        </Show>
      </div>

      <Show when={open()}>
        <div
          class="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-stroke bg-white py-2 shadow-lg"
          role="dialog"
          aria-label="Online teammates"
        >
          <div class="border-b border-stroke px-4 py-2">
            <p class="text-sm font-semibold text-text-primary">Online now</p>
            <p class="text-xs text-text-secondary">See who is in the app and what they are working on.</p>
          </div>
          <ul class="max-h-72 overflow-y-auto py-1">
            <For each={users()}>
              {(user) => (
                <li>
                  <Show
                    when={!user.is_self && canMessage()}
                    fallback={
                      <div class="flex items-start gap-3 px-4 py-2.5">
                        <span class="relative mt-0.5">
                          <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" />
                          {onlineIndicator()}
                        </span>
                        <div class="min-w-0 flex-1">
                          <p class="truncate text-sm font-medium text-text-primary">
                            {user.full_name}
                            <Show when={user.is_self}>
                              <span class="ml-1 text-xs font-normal text-text-secondary">(you)</span>
                            </Show>
                          </p>
                          <p class="truncate text-xs text-text-secondary">{activitySummary(user)}</p>
                          <p class="text-[11px] text-text-secondary/80">{formatSeen(user.last_seen_at)}</p>
                        </div>
                      </div>
                    }
                  >
                    <button
                      type="button"
                      class="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-slate-50 disabled:opacity-60"
                      title={`Message ${user.full_name}`}
                      disabled={messagingId() === user.user_id}
                      onClick={(e) => void messageUser(user, e)}
                    >
                      <span class="relative mt-0.5">
                        <UserAvatar name={user.full_name} avatarUrl={user.avatar_url} size="sm" />
                        {onlineIndicator()}
                      </span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-text-primary">{user.full_name}</p>
                        <p class="truncate text-xs text-text-secondary">{activitySummary(user)}</p>
                        <p class="text-[11px] text-text-secondary/80">{formatSeen(user.last_seen_at)}</p>
                      </div>
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <Show when={users().length === 0 && !online.isFetching}>
            <p class="px-4 py-3 text-sm text-text-secondary">No teammates online right now.</p>
          </Show>
        </div>
        <button
          type="button"
          class="fixed inset-0 z-40 cursor-default"
          aria-label="Close online panel"
          onClick={() => setOpen(false)}
        />
      </Show>
    </div>
  );
}
